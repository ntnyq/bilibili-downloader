import { z } from 'zod'
import { browser } from '#imports'
import { downloadJobSchema, downloadJobsSchema } from '~/types/download'
import { getVideoMedia } from '../bilibili/api'
import { exportAsset } from './exportAsset'
import { MediaNetworkError } from './fetchMedia'
import { createMediaCache, pruneMediaCache } from './mediaCache'
import { mergeMedia } from './mergeMedia'
import { sendDownloadMessage } from './messages'
import {
  createFilename,
  errorMessage,
  JOBS_STORAGE_KEY,
  MAX_INPUT_BYTES,
} from './model'
import { fetchCachedMedia } from './resumableMedia'
import { saveFile } from './saveFile'
import {
  abortChangedJobRun,
  abortStaleJobRun,
  confirmJobUpdate,
  shouldClearAbortedJobCache,
} from './taskControl'
import type { Browser } from '#imports'
import type { DownloadJob, JobUpdate } from '~/types/download'

async function runJob(job: DownloadJob, controller: AbortController) {
  const { signal } = controller
  let updates = Promise.resolve<unknown>(undefined)
  let lastProgressAt = 0
  const update = (patch: JobUpdate) => {
    const next = updates.then(async () => {
      signal.throwIfAborted()
      const accepted = await sendDownloadMessage(
        { type: 'runner.update', id: job.id, runId: job.runId, update: patch },
        z.boolean(),
      )
      // A pause may win the storage write before its change event arrives.
      confirmJobUpdate(accepted, controller)
    })
    // A transient progress-message failure must not poison later state updates.
    // Awaited transitions still receive their own error.
    updates = next.catch(() => undefined)
    return next.then(() => undefined)
  }
  if (!['video', 'audio'].includes(job.kind)) {
    try {
      const asset = await exportAsset(job, signal, receivedBytes => {
        if (Date.now() - lastProgressAt < 500) {
          return
        }
        lastProgressAt = Date.now()
        update({ status: 'downloading', receivedBytes }).catch(error => {
          if (!signal.aborted) {
            console.error(error)
          }
        })
      })
      const filename = createFilename(
        { ...job, quality: asset.quality },
        asset.extension,
      )
      await update({
        status: 'saving',
        quality: asset.quality,
        filename,
        progress: 97,
      })
      await saveFile(asset.blob, filename, signal, downloadId =>
        update({ downloadId }),
      )
      await update({ status: 'completed', progress: 100 })
    } finally {
      await updates
    }
    return
  }
  const cache = await createMediaCache(job.id)
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        signal.throwIfAborted()
        await update({ status: 'resolving', receivedBytes: 0, progress: 0 })
        const media = await getVideoMedia(
          job.bvid,
          job.cid,
          signal,
          job.kind === 'audio' ? 'best' : job.qualityPreference,
          job.kind === 'audio' ? 'audio' : 'video',
        )
        const estimatedBytes = Math.round(
          media.inputs.reduce(
            (sum, input) => sum + (input.bandwidth * job.duration) / 8,
            0,
          ),
        )
        await update({ quality: media.quality, totalBytes: estimatedBytes })
        if (estimatedBytes > MAX_INPUT_BYTES) {
          throw new RangeError(
            '预计音视频输入超过浏览器 512 MB 上限，请导出本地任务使用 FFmpeg 助手。',
          )
        }
        // A different selection must never combine tracks from an older run.
        const identity = [
          job.bvid,
          job.cid,
          media.kind,
          media.inputs.map(input => input.id),
        ]
        const keys = media.inputs.map((_, index) =>
          JSON.stringify([...identity, index]),
        )
        await cache.retain(keys)
        await update({ status: 'downloading' })
        let receivedBytes = 0
        const inputs: Blob[] = []
        for (const [index, input] of media.inputs.entries()) {
          const blob = await fetchCachedMedia({
            cache,
            inputKey: keys[index]!,
            urls: input.urls,
            signal,
            maxBytes: MAX_INPUT_BYTES - receivedBytes,
            onProgress(received) {
              if (Date.now() - lastProgressAt < 500) {
                return
              }
              lastProgressAt = Date.now()
              const currentBytes = receivedBytes + received
              update({
                receivedBytes: currentBytes,
                progress: estimatedBytes
                  ? Math.min(85, (currentBytes / estimatedBytes) * 85)
                  : 0,
              }).catch(error => {
                if (!signal.aborted) {
                  console.error(error)
                }
              })
            },
          })
          receivedBytes += blob.size
          inputs.push(blob)
        }
        signal.throwIfAborted()
        await update({
          status: 'merging',
          progress: 90,
          receivedBytes,
          totalBytes: receivedBytes,
        })
        const blob = await mergeMedia(media.kind, inputs, signal)
        const filename = createFilename({ ...job, quality: media.quality })
        await update({ status: 'saving', progress: 97, filename })
        await saveFile(blob, filename, signal, downloadId =>
          update({ downloadId }),
        )
        await update({ status: 'completed', progress: 100 })
        // Cleanup errors must not turn a saved file into a failed task.
        await cache.clear().catch(console.warn)
        return
      } catch (error) {
        signal.throwIfAborted()
        // Refresh expired URLs once. The cache verifies the representation
        // again before using any bytes from the previous request.
        if (!(error instanceof MediaNetworkError) || attempt > 0) {
          throw error
        }
      }
    }
  } finally {
    if (shouldClearAbortedJobCache(signal)) {
      await cache.clear().catch(console.warn)
    }
    await updates
  }
}

/**
 * Elect one runner across tabs; the background serializes queue writes.
 */
export async function startDownloadRunner(onError: (message: string) => void) {
  await navigator.locks.request(
    'bilibili-download-runner',
    { ifAvailable: true },
    async lock => {
      if (!lock) {
        onError('已有下载中心正在运行，请使用原来的下载中心。')
        return
      }
      await sendDownloadMessage({ type: 'runner.ready' }, z.null())
      let lastPruneAt = 0
      while (true) {
        if (Date.now() - lastPruneAt > 10000) {
          lastPruneAt = Date.now()
          await navigator.locks.request(
            'bilibili-media-cache',
            { ifAvailable: true },
            async cacheLock => {
              if (!cacheLock) {
                return
              }
              const jobs = await sendDownloadMessage(
                { type: 'queue.list' },
                downloadJobsSchema,
              )
              await pruneMediaCache(
                jobs
                  .filter(
                    item => !['completed', 'cancelled'].includes(item.status),
                  )
                  .map(item => item.id),
              ).catch(console.warn)
            },
          )
        }
        const controller = new AbortController()
        const job = await sendDownloadMessage(
          { type: 'runner.claim' },
          downloadJobSchema.nullable(),
        )
        if (!job) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
        const onChanged = (
          changes: Record<string, Browser.storage.StorageChange>,
          area: string,
        ) => {
          if (area !== 'local' || !changes[JOBS_STORAGE_KEY]) {
            return
          }
          const result = downloadJobsSchema.safeParse(
            changes[JOBS_STORAGE_KEY].newValue,
          )
          const previous = downloadJobsSchema.safeParse(
            changes[JOBS_STORAGE_KEY].oldValue,
          )
          if (result.success) {
            abortChangedJobRun(
              job,
              previous.success
                ? previous.data.find(item => item.id === job.id)
                : undefined,
              result.data.find(item => item.id === job.id),
              controller,
            )
          }
        }
        browser.storage.onChanged.addListener(onChanged)
        try {
          const jobs = await sendDownloadMessage(
            { type: 'queue.list' },
            downloadJobsSchema,
          )
          abortStaleJobRun(
            job,
            jobs.find(item => item.id === job.id),
            controller,
          )
          await navigator.locks.request(
            'bilibili-media-cache',
            { signal: controller.signal },
            async () => {
              await runJob(job, controller)
            },
          )
        } catch (error) {
          if (!controller.signal.aborted) {
            await sendDownloadMessage(
              {
                type: 'runner.update',
                runId: job.runId,
                id: job.id,
                update: { status: 'failed', error: errorMessage(error) },
              },
              z.boolean(),
            )
          }
        } finally {
          browser.storage.onChanged.removeListener(onChanged)
        }
      }
    },
  )
}
