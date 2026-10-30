import { z } from 'zod'
import { browser } from '#imports'
import { downloadJobSchema, downloadJobsSchema } from '~/types/download'
import { NATIVE_HOST_NAME, nativeEventSchema } from '~/types/nativeBridge'
import { getVideoMedia } from '~/utils/bilibili/api'
import { JOBS_STORAGE_KEY } from '~/utils/downloads/constants'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import {
  createNativeRequest,
  isSameNativeTask,
} from '~/utils/downloads/native/bridge'
import { localizeNativeError } from '~/utils/downloads/native/localizeNativeError'
import { createNativeManifest } from '~/utils/downloads/native/manifest'
import { i18n } from '~/utils/i18n'
import type { Browser } from '#imports'
import type { DownloadJob } from '~/types/download'
import type { requestSchema } from '~/utils/downloads/messages'
import type { NativeManifest } from '~/utils/downloads/native/bridge'

type NativeUpdate = Extract<
  z.infer<typeof requestSchema>,
  { type: 'native.update' }
>['update']

const sessions = new Map<string, ReturnType<typeof createNativeSession>>()

/**
 * Keep only running sessions shared across row mounts. Idle rows hold their
 * own feedback without retaining a page listener or a signed media manifest.
 */
export function useNativeBridge(getJob: () => DownloadJob) {
  const id = getJob().id
  const session = shallowRef(sessions.get(id))
  return {
    isRunning: computed(() => session.value?.isRunning.value ?? false),
    status: computed(() => session.value?.status.value ?? ''),
    error: computed(() => session.value?.error.value ?? ''),
    outputPath: computed(() => session.value?.outputPath.value ?? ''),
    start() {
      const current =
        sessions.get(id)
        ?? createNativeSession(() => {
          if (sessions.get(id) === current) {
            sessions.delete(id)
          }
        })
      sessions.set(id, current)
      session.value = current
      return current.start(getJob())
    },
  }
}

function createNativeSession(onSettled: () => void) {
  const isRunning = shallowRef(false)
  const status = shallowRef('')
  const error = shallowRef('')
  const outputPath = shallowRef('')
  let controller: AbortController | undefined
  let port: ReturnType<typeof browser.runtime.connectNative> | undefined
  let claimedJob: DownloadJob | undefined
  let requestId = ''
  let manifest: NativeManifest | undefined
  let refreshCount = 0
  let isRefreshing = false
  let isFinishing = false
  let writes = Promise.resolve()
  let startupTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0

  function settle() {
    window.removeEventListener('pagehide', handlePageHide)
    manifest = undefined
    claimedJob = undefined
    controller = undefined
    writes = Promise.resolve()
    isRunning.value = false
    onSettled()
  }

  function handleMessage(value: unknown) {
    receive(value)
  }

  function handleDisconnect() {
    const detail = browser.runtime.lastError?.message
    if (!isFinishing) {
      finishFailure(
        detail
          ? i18n.t('useNativeBridge.cannotConnectToTheLocalHelperCheckIts', [
              detail,
            ])
          : i18n.t(
              'useNativeBridge.localHelperDisconnectedTheMediaCacheIsRetained',
            ),
      )
    }
  }

  function releasePort(shouldCancel = false) {
    clearTimeout(startupTimer)
    controller?.abort()
    browser.storage.onChanged.removeListener(handleQueueChange)
    const current = port
    port = undefined
    if (!current) {
      return
    }
    current.onMessage.removeListener(handleMessage)
    current.onDisconnect.removeListener(handleDisconnect)
    if (!shouldCancel) {
      current.disconnect()
      return
    }
    // Let the host flush its checkpoint and release its lock before disconnecting.
    const stoppedRequestId = requestId
    const timer = setTimeout(() => current.disconnect(), 35000)
    current.onMessage.addListener(value => {
      const event = nativeEventSchema.safeParse(value)
      if (
        event.success
        && event.data.requestId === stoppedRequestId
        && ['completed', 'failed'].includes(event.data.type)
      ) {
        clearTimeout(timer)
        current.disconnect()
      }
    })
    current.onDisconnect.addListener(() => {
      const detail = browser.runtime.lastError?.message
      if (detail && !error.value) {
        error.value = detail
      }
      clearTimeout(timer)
    })
    try {
      current.postMessage({ version: 1, type: 'cancel', requestId })
    } catch {
      clearTimeout(timer)
      current.disconnect()
    }
  }

  function persist(update: NativeUpdate) {
    const job = claimedJob
    const runId = job?.runId
    if (!job || !runId) {
      return Promise.resolve()
    }
    writes = writes.then(async () => {
      const accepted = await sendDownloadMessage(
        { type: 'native.update', id: job.id, runId, update },
        z.boolean(),
      )
      if (!accepted) {
        throw new Error(
          i18n.t('useNativeBridge.theLocalTaskWasCancelledOrItsExecution'),
        )
      }
    })
    return writes
  }

  async function finishFailure(reason: string) {
    if (isFinishing) {
      return
    }
    isFinishing = true
    error.value = reason
    releasePort(true)
    try {
      await writes.catch(() => {})
      writes = Promise.resolve()
      await persist({ status: 'failed', error: reason })
    } catch {
      // A cancelled/deleted job is deliberately rejected by the queue owner.
    } finally {
      settle()
    }
  }

  async function resolveManifest() {
    const job = claimedJob
    const signal = controller?.signal
    if (!job || !signal) {
      throw new Error(
        i18n.t('useNativeBridge.theLocalTaskHasNotBeenInitialized'),
      )
    }
    const media = await getVideoMedia(
      job.bvid,
      job.cid,
      signal,
      job.kind === 'audio' ? 'best' : job.qualityPreference,
      job.kind === 'audio' ? 'audio' : 'video',
    )
    signal.throwIfAborted()
    return createNativeManifest(job, media)
  }

  async function refreshManifest() {
    if (isRefreshing || !manifest || refreshCount >= 2) {
      throw new Error(
        i18n.t('useNativeBridge.mediaUrlRefreshLimitReachedCheckYourSign'),
      )
    }
    isRefreshing = true
    const currentGeneration = generation
    refreshCount++
    status.value = i18n.t(
      'useNativeBridge.mediaUrlsExpiredFetchingStreamsAgainAndValidating',
    )
    try {
      const next = await resolveManifest()
      if (isFinishing || currentGeneration !== generation) {
        return
      }
      if (!isSameNativeTask(manifest, next)) {
        throw new Error(
          i18n.t(
            'useNativeBridge.assetsOrQualityChangedAfterRefreshingStreamsStart',
          ),
        )
      }
      manifest = next
      port?.postMessage(createNativeRequest('refresh', requestId, next))
    } finally {
      if (currentGeneration === generation) {
        isRefreshing = false
      }
    }
  }

  async function receive(value: unknown) {
    if (isFinishing) {
      return
    }
    const currentGeneration = generation
    try {
      const event = nativeEventSchema.parse(value)
      if (event.requestId !== requestId) {
        throw new Error(
          i18n.t('useNativeBridge.theLocalHelperReturnedAMismatchedTaskId'),
        )
      }
      clearTimeout(startupTimer)
      switch (event.type) {
        case 'started':
          status.value = i18n.t('useNativeBridge.theLocalHelperReceivedTheTask')
          break
        case 'progress':
          status.value =
            event.status === 'downloading'
              ? i18n.t('useNativeBridge.assetMib', [
                  event.inputIndex ?? 1,
                  event.inputCount ?? 1,
                  ((event.receivedBytes ?? 0) / 1024 ** 2).toFixed(1),
                ])
              : event.status === 'merging'
                ? i18n.t('useNativeBridge.remuxingLosslesslyWithLocalFfmpeg')
                : i18n.t('useNativeBridge.savingLocalFile')
          await persist({
            status: 'native',
            ...(event.receivedBytes === undefined
              ? {}
              : { receivedBytes: event.receivedBytes }),
            ...(manifest ? { quality: manifest.quality } : {}),
          })
          break
        case 'refreshRequired':
          await refreshManifest()
          break
        case 'completed':
          isFinishing = true
          outputPath.value = event.filename
          status.value = i18n.t('useNativeBridge.localDownloadCompleted')
          releasePort()
          try {
            await persist({
              status: 'completed',
              progress: 100,
              filename: event.filename,
              quality: event.quality,
              error: '',
            })
          } catch (error_) {
            error.value = i18n.t(
              'useNativeBridge.fileSavedButTheTaskRecordCouldNot',
              [getErrorMessage(error_)],
            )
          }
          settle()
          break
        case 'failed':
          await finishFailure(localizeNativeError(event.error))
          break
      }
    } catch (error_) {
      if (currentGeneration === generation) {
        await finishFailure(getErrorMessage(error_))
      }
    }
  }

  async function start(job: DownloadJob) {
    if (isRunning.value) {
      return
    }
    isRunning.value = true
    window.addEventListener('pagehide', handlePageHide)
    const currentGeneration = ++generation
    isFinishing = false
    claimedJob = undefined
    error.value = ''
    outputPath.value = ''
    status.value = i18n.t('useNativeBridge.connectingToLocalHelper')
    writes = Promise.resolve()
    refreshCount = 0
    isRefreshing = false
    try {
      // Request on the original click, before any asynchronous media lookup.
      const granted = await browser.permissions.request({
        permissions: ['nativeMessaging'],
      })
      if (!granted) {
        throw new Error(
          i18n.t(
            'useNativeBridge.localHelperMessagingPermissionHasNotBeenGranted',
          ),
        )
      }
      if (isFinishing || currentGeneration !== generation) {
        return
      }
      const claimed = await sendDownloadMessage(
        { type: 'native.start', id: job.id },
        downloadJobSchema,
      )
      if (isFinishing || currentGeneration !== generation) {
        if (claimed.runId) {
          await sendDownloadMessage(
            {
              type: 'native.update',
              id: claimed.id,
              runId: claimed.runId,
              update: {
                status: 'failed',
                error: i18n.t(
                  'useNativeBridge.theDownloadPageClosedTheLocalTaskDid',
                ),
              },
            },
            z.boolean(),
          )
        }
        return
      }
      claimedJob = claimed
      browser.storage.onChanged.addListener(handleQueueChange)
      controller = new AbortController()
      const selected = await resolveManifest()
      if (isFinishing || currentGeneration !== generation) {
        return
      }
      manifest = selected
      const jobs = await sendDownloadMessage(
        { type: 'queue.list' },
        downloadJobsSchema,
      )
      const current = jobs.find(item => item.id === claimedJob?.id)
      if (isFinishing || currentGeneration !== generation) {
        return
      }
      if (current?.status !== 'native' || current.runId !== claimedJob.runId) {
        throw new Error(
          i18n.t('useNativeBridge.theTaskWasCancelledOrItsExecutionIdentity'),
        )
      }
      controller.signal.throwIfAborted()
      requestId = crypto.randomUUID()
      port = browser.runtime.connectNative(NATIVE_HOST_NAME)
      port.onMessage.addListener(handleMessage)
      port.onDisconnect.addListener(handleDisconnect)
      port.postMessage(createNativeRequest('start', requestId, manifest))
      startupTimer = setTimeout(
        () =>
          finishFailure(
            i18n.t('useNativeBridge.theLocalHelperDidNotRespondCheckIts'),
          ),
        15000,
      )
    } catch (error_) {
      if (currentGeneration === generation) {
        await finishFailure(getErrorMessage(error_))
      }
    }
  }

  function handleQueueChange(
    changes: Record<string, Browser.storage.StorageChange>,
    area: string,
  ) {
    const change = changes[JOBS_STORAGE_KEY]
    if (area !== 'local' || !change || !claimedJob || isFinishing) {
      return
    }
    const parsed = downloadJobsSchema.safeParse(change.newValue ?? [])
    if (!parsed.success) {
      return
    }
    const current = parsed.data.find(item => item.id === claimedJob?.id)
    const previousJobs = downloadJobsSchema.safeParse(change.oldValue ?? [])
    const previous = previousJobs.success
      ? previousJobs.data.find(item => item.id === claimedJob?.id)
      : undefined
    if (
      previous?.runId !== claimedJob.runId
      && current?.runId !== claimedJob.runId
    ) {
      return
    }
    if (current?.status !== 'native' || current.runId !== claimedJob.runId) {
      finishFailure(
        i18n.t('useNativeBridge.taskStoppedVerifiedLocalCacheWillBeReused'),
      )
    }
  }

  // A filtered-out row must not stop the task; only the owning page does.
  function handlePageHide() {
    if (isRunning.value && !isFinishing) {
      finishFailure(
        i18n.t('useNativeBridge.theDownloadPageClosedAndTheLocalTask'),
      )
    } else {
      releasePort()
    }
  }

  return {
    isRunning: readonly(isRunning),
    status: readonly(status),
    error: readonly(error),
    outputPath: readonly(outputPath),
    start,
  }
}
