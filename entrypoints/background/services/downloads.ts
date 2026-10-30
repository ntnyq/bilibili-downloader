import { z } from 'zod'
import { browser } from '#imports'
import { BATCH_REQUEST_INTERVAL_MS } from '~/types/batch'
import { batchSessionSchema } from '~/types/batchSession'
import { downloadJobsSchema, downloadSettingsSchema } from '~/types/download'
import { DOWNLOAD_LIBRARY_STORAGE_KEY } from '~/types/downloadHistory'
import { BilibiliApiError, getVideoInfo } from '~/utils/bilibili/api'
import { getBatchPage } from '~/utils/bilibili/batch'
import { MEDIA_DOMAINS } from '~/utils/bilibili/streams'
import { createVideoInfoCache } from '~/utils/bilibili/videoInfoCache'
import { createBatchJobs } from '~/utils/downloads/batch/jobs'
import {
  BATCH_SESSION_STORAGE_KEY,
  commitBatchSessionResult,
  createBatchSessionData,
  findBatchSessionReceiptRow,
  getBatchSessionRow,
  saveBatchSession,
} from '~/utils/downloads/batch/session'
import {
  JOBS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
} from '~/utils/downloads/constants'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import {
  createDownloadLibrary,
  createJobFromHistory,
  deleteLibraryRecord,
  initializeDownloadLibrary,
  recordLibraryCompletions,
} from '~/utils/downloads/history/library'
import { DOWNLOAD_KIND_LABELS } from '~/utils/downloads/labels'
import { requestSchema } from '~/utils/downloads/messages'
import {
  applyNativeJobUpdate,
  startNativeJob,
} from '~/utils/downloads/native/queue'
import { createBundleJobs } from '~/utils/downloads/queue/bundles'
import {
  assertDownloadQueueCapacity,
  clearFinishedDownloadJobs,
  pruneDownloadJobs,
} from '~/utils/downloads/queue/capacity'
import {
  canApplyJobUpdate,
  moveQueuedJob,
  pauseJob,
  resumeJob,
} from '~/utils/downloads/queue/control'
import {
  createDownloadJobs,
  getNextQueuedJob,
  isJobActive,
  retryDownloadJobs,
} from '~/utils/downloads/queue/jobs'
import { i18n } from '~/utils/i18n'
import type { Browser } from '#imports'
import type { BatchAddResult } from '~/types/batchSession'
import type { DownloadJob, VideoInfo } from '~/types/download'

const RUNNER_STORAGE_KEY = 'downloadRunnerTabId'
const getCachedVideoInfo = createVideoInfoCache(getVideoInfo)
let queueLock = Promise.resolve<unknown>(undefined)
let headerRules: Promise<void> | undefined
let batchLock = Promise.resolve<unknown>(undefined)
let nextBatchRequestAt = 0

/**
 * Batch discovery and metadata share a throttle across download-center tabs.
 * Network waits never hold the queue lock, so cancellation stays responsive.
 */
function scheduleBatchRequest<T>(operation: () => Promise<T>): Promise<T> {
  const next = batchLock.then(async () => {
    const delay = nextBatchRequestAt - Date.now()
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
    nextBatchRequestAt = Date.now() + BATCH_REQUEST_INTERVAL_MS
    return operation()
  })
  batchLock = next.catch(() => undefined)
  return next
}

function shouldStopBatch(error: unknown): boolean {
  if (error instanceof BilibiliApiError) {
    return error.shouldStopBatch
  }
  return (
    error instanceof TypeError
    || error instanceof DOMException
    || error instanceof z.ZodError
  )
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = queueLock.then(operation)
  queueLock = next.catch(() => undefined)
  return next
}

async function readJobs(): Promise<DownloadJob[]> {
  const stored = await browser.storage.local.get(JOBS_STORAGE_KEY)
  return downloadJobsSchema.parse(stored[JOBS_STORAGE_KEY] || [])
}

async function readSettings() {
  const stored = await browser.storage.local.get(SETTINGS_STORAGE_KEY)
  return downloadSettingsSchema.parse(stored[SETTINGS_STORAGE_KEY] || {})
}

async function readBatchSession() {
  const stored = await browser.storage.local.get(BATCH_SESSION_STORAGE_KEY)
  if (stored[BATCH_SESSION_STORAGE_KEY] === undefined) {
    return null
  }
  const result = batchSessionSchema.safeParse(stored[BATCH_SESSION_STORAGE_KEY])
  if (!result.success) {
    throw new Error(i18n.t('downloads.theBatchSessionIsCorruptAndCannotBe'))
  }
  return result.data
}

async function readLibrary(jobs: DownloadJob[]) {
  const stored = await browser.storage.local.get(DOWNLOAD_LIBRARY_STORAGE_KEY)
  const library = initializeDownloadLibrary(
    stored[DOWNLOAD_LIBRARY_STORAGE_KEY],
    jobs,
  )
  if (stored[DOWNLOAD_LIBRARY_STORAGE_KEY] === undefined) {
    await browser.storage.local.set({ [DOWNLOAD_LIBRARY_STORAGE_KEY]: library })
  }
  return library
}

async function writeJobs(
  jobs: DownloadJob[],
  extra: Record<string, unknown> = {},
) {
  const stored = await browser.storage.local.get([
    JOBS_STORAGE_KEY,
    DOWNLOAD_LIBRARY_STORAGE_KEY,
  ])
  const previous = downloadJobsSchema.parse(stored[JOBS_STORAGE_KEY] || [])
  assertDownloadQueueCapacity(previous, jobs)
  const completed = new Set(
    previous.filter(job => job.status === 'completed').map(job => job.id),
  )
  const libraryPatch: Record<string, unknown> = {}
  // Progress updates should not parse and re-encode thousands of history records.
  if (
    stored[DOWNLOAD_LIBRARY_STORAGE_KEY] === undefined
    || jobs.some(job => job.status === 'completed' && !completed.has(job.id))
  ) {
    const library = initializeDownloadLibrary(
      stored[DOWNLOAD_LIBRARY_STORAGE_KEY],
      previous,
    )
    libraryPatch[DOWNLOAD_LIBRARY_STORAGE_KEY] = recordLibraryCompletions(
      library,
      previous,
      jobs,
    )
  }
  await browser.storage.local.set({
    ...extra,
    ...libraryPatch,
    [JOBS_STORAGE_KEY]: pruneDownloadJobs(jobs),
  })
}

function ensureHeaders() {
  headerRules ||= browser.declarativeNetRequest
    .updateSessionRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              {
                header: 'Referer',
                operation: 'set',
                value: 'https://www.bilibili.com/',
              },
            ],
          },
          condition: {
            initiatorDomains: [new URL(browser.runtime.getURL('/')).hostname],
            requestDomains: [
              'api.bilibili.com',
              'comment.bilibili.com',
              ...MEDIA_DOMAINS,
            ],
            resourceTypes: ['xmlhttprequest'],
          },
        },
      ],
    })
    .catch(error => {
      headerRules = undefined
      throw error
    })
  return headerRules
}

async function openRunner(active: boolean) {
  const url = browser.runtime.getURL('/downloads.html')
  const tabs = await browser.tabs.query({ url })
  const stored = await browser.storage.local.get(RUNNER_STORAGE_KEY)
  const existing =
    tabs.find(tab => tab.id === stored[RUNNER_STORAGE_KEY]) || tabs[0]
  if (existing?.id !== undefined) {
    if (active) {
      await browser.tabs.update(existing.id, { active: true })
      await browser.windows.update(existing.windowId, { focused: true })
    }
    return
  }
  await browser.tabs.create({ url, active })
}

async function recoverInterruptedJobs(
  jobs: DownloadJob[],
  includeQueued = false,
) {
  for (const job of jobs) {
    if (
      !isJobActive(job)
      || job.status === 'paused'
      || (!includeQueued && job.status === 'queued')
    ) {
      continue
    }
    if (job.downloadId !== undefined) {
      const [download] = await browser.downloads.search({ id: job.downloadId })
      if (download?.state === 'complete') {
        job.status = 'completed'
        job.progress = 100
        continue
      }
      if (download?.state === 'in_progress') {
        await browser.downloads.cancel(job.downloadId).catch(() => undefined)
      }
    }
    job.status = 'failed'
    job.error = ['video', 'audio'].includes(job.kind)
      ? i18n.t('downloads.theDownloadCenterWasClosedOrRefreshedInterrupting')
      : i18n.t('downloads.theDownloadCenterWasClosedOrRefreshedInterrupting2')
  }
}

function isRunner(sender: Browser.runtime.MessageSender): boolean {
  return (
    sender.url === browser.runtime.getURL('/downloads.html')
    && sender.tab?.id !== undefined
  )
}

async function ensureBatchTabOpen(sender: Browser.runtime.MessageSender) {
  const tabId = sender.tab?.id
  const tab = tabId === undefined ? undefined : await browser.tabs.get(tabId)
  if (tab?.url !== browser.runtime.getURL('/downloads.html')) {
    throw new Error(
      i18n.t('downloads.theDownloadCenterClosedThisImportHasStopped'),
    )
  }
}

async function handleRequest(
  message: z.infer<typeof requestSchema>,
  sender: Browser.runtime.MessageSender,
) {
  if (message.type.startsWith('batch.session.')) {
    if (!isRunner(sender)) {
      throw new Error(i18n.t('downloads.useBatchImportInTheDownloadCenter'))
    }
    return serialize(async () => {
      if (message.type === 'batch.session.reset') {
        const stored = await browser.storage.local.get(
          BATCH_SESSION_STORAGE_KEY,
        )
        if (
          batchSessionSchema.safeParse(stored[BATCH_SESSION_STORAGE_KEY])
            .success
        ) {
          throw new Error(
            i18n.t('downloads.theCurrentSessionIsStillReadableLoadThe'),
          )
        }
        const result = saveBatchSession(null, createBatchSessionData(), null)
        await browser.storage.local.set({
          [BATCH_SESSION_STORAGE_KEY]: result.session,
        })
        return result.session
      }
      const current = await readBatchSession()
      if (message.type === 'batch.session.get') {
        return current
      }
      if (message.type !== 'batch.session.save') {
        throw new Error(i18n.t('downloads.unsupportedBatchSessionAction'))
      }
      const result = saveBatchSession(
        current,
        message.session,
        message.expectedRevision,
      )
      if (!result.conflict) {
        await browser.storage.local.set({
          [BATCH_SESSION_STORAGE_KEY]: result.session,
        })
      }
      return result
    })
  }
  if (message.type === 'batch.page' || message.type === 'batch.add') {
    if (!isRunner(sender)) {
      throw new Error(i18n.t('downloads.useBatchImportInTheDownloadCenter'))
    }
    if (message.type === 'batch.page') {
      await ensureHeaders()
      return scheduleBatchRequest(async () => {
        await ensureBatchTabOpen(sender)
        return getBatchPage(message.source, message.page)
      })
    }
    const replay = await serialize(async () => {
      const session = await readBatchSession()
      const row = getBatchSessionRow(session, message)
      if (row.receipt) {
        return {
          result: row.receipt,
          session,
        }
      }
      if (session) {
        const previous = findBatchSessionReceiptRow(session, message.rowKey)
        if (previous?.receipt) {
          const result = {
            added: 0,
            skipped: previous.receipt.added + previous.receipt.skipped,
            shouldStop: false,
            bvid: previous.receipt.bvid,
          }
          const next = commitBatchSessionResult(session, message.rowKey, result)
          await browser.storage.local.set({ [BATCH_SESSION_STORAGE_KEY]: next })
          return {
            result,
            session: next,
          }
        }
      }
      return null
    })
    if (replay) {
      return replay
    }
    let video: VideoInfo | undefined
    let failure: BatchAddResult | undefined
    try {
      await ensureHeaders()
      video = await scheduleBatchRequest(async () => {
        await ensureBatchTabOpen(sender)
        // A newer preview may replace this request while it waits for the throttle.
        await serialize(async () => {
          getBatchSessionRow(await readBatchSession(), message)
        })
        return getVideoInfo(message.item.videoId)
      })
    } catch (error) {
      failure = {
        added: 0,
        skipped: 0,
        error: getErrorMessage(error),
        shouldStop: shouldStopBatch(error),
      }
    }
    if (
      video
      && message.kind !== 'cover'
      && message.mode === 'current'
      && !video.pages.some(page => page.page === message.item.page)
    ) {
      failure = {
        added: 0,
        skipped: 0,
        error: i18n.t('downloads.theLinkedPartDoesNotExistUpdateThe'),
        shouldStop: false,
      }
    }
    return serialize(async () => {
      const session = await readBatchSession()
      const row = getBatchSessionRow(session, message)
      if (!session) {
        throw new Error(
          i18n.t('downloads.theBatchSessionDoesNotExistPreviewAgain'),
        )
      }
      if (row.receipt) {
        return {
          result: row.receipt,
          session,
        }
      }
      const existing = await readJobs()
      await ensureBatchTabOpen(sender)
      let added: DownloadJob[] = []
      let result: BatchAddResult
      try {
        if (failure) {
          result = failure
        } else if (video) {
          const previous = findBatchSessionReceiptRow(
            session,
            message.rowKey,
            video.bvid,
          )
          if (previous?.receipt) {
            result = {
              added: 0,
              skipped: previous.receipt.added + previous.receipt.skipped,
              shouldStop: false,
              bvid: video.bvid,
            }
          } else {
            const library = await readLibrary(existing)
            const created = createBatchJobs(
              video,
              message.item,
              existing,
              message,
              library.records.map(record => record.identity),
            )
            added = created.jobs
            result = {
              added: added.length,
              skipped: created.skipped,
              shouldStop: false,
              bvid: video.bvid,
            }
          }
        } else {
          throw new Error(
            i18n.t('downloads.cannotLoadVideoInformationPleaseTryAgain'),
          )
        }
      } catch (error) {
        result = {
          added: 0,
          skipped: 0,
          error: getErrorMessage(error),
          // A storage/capacity failure must not cascade through the import.
          shouldStop: true,
        }
      }
      const next = commitBatchSessionResult(session, message.rowKey, result)
      if (added.length) {
        await openRunner(false)
      }
      // Queue membership and the receipt share one write; a lost reply can be replayed.
      await writeJobs([...existing, ...added], {
        [BATCH_SESSION_STORAGE_KEY]: next,
      })
      return {
        result,
        session: next,
      }
    })
  }
  if (message.type === 'video.get') {
    await ensureHeaders()
    return getCachedVideoInfo(message.videoId)
  }
  if (message.type === 'queue.add' || message.type === 'queue.bundle.add') {
    await ensureHeaders()
  }
  // Slow API requests must not hold the queue lock and block cancellation.
  const video =
    message.type === 'queue.add' || message.type === 'queue.bundle.add'
      ? await getVideoInfo(message.videoId)
      : undefined
  return serialize(async () => {
    if (message.type === 'settings.get') {
      return readSettings()
    }
    if (message.type === 'settings.update') {
      const settings = { ...(await readSettings()), ...message.settings }
      if (
        message.settings.notifyOnComplete === true
        && !(await browser.permissions.contains({
          permissions: ['notifications'],
        }))
      ) {
        throw new Error(
          i18n.t(
            'downloads.enableNotificationsInSettingsAndGrantNotificationPermission',
          ),
        )
      }
      await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings })
      if (message.settings.isPaused === false) {
        await openRunner(false)
      }
      return settings
    }
    const jobs = await readJobs()
    if (message.type.startsWith('library.')) {
      if (message.type === 'library.clear') {
        await browser.storage.local.set({
          [DOWNLOAD_LIBRARY_STORAGE_KEY]: createDownloadLibrary(),
        })
        return null
      }
      const library = await readLibrary(jobs)
      if (message.type === 'library.list') {
        return library
      }
      if (message.type === 'library.delete') {
        const next = deleteLibraryRecord(library, message.identity)
        await browser.storage.local.set({
          [DOWNLOAD_LIBRARY_STORAGE_KEY]: next,
        })
        return null
      }
      if (message.type === 'library.requeue') {
        const record = library.records.find(
          item => item.identity === message.identity,
        )
        if (!record) {
          throw new Error(
            i18n.t(
              'downloads.thisSuccessfulDownloadRecordWasRemovedRefreshThe',
            ),
          )
        }
        const job = createJobFromHistory(record, jobs)
        await openRunner(false)
        await writeJobs([...jobs, job])
        return null
      }
    }
    if (message.type === 'queue.list') {
      return jobs
    }
    if (message.type === 'runner.open') {
      await openRunner(true)
      return null
    }
    if (message.type === 'queue.add' && video) {
      await ensureHeaders()
      const added = createDownloadJobs(
        video,
        message.page,
        message.mode,
        jobs,
        {
          selectedPages: message.selectedPages,
          quality: message.quality,
          kind: message.kind,
          subtitleLanguage: message.subtitleLanguage,
          settings: await readSettings(),
        },
      )
      await openRunner(false)
      await writeJobs([...jobs, ...added])
      return {
        added: added.length,
      }
    }
    if (message.type === 'queue.bundle.add' && video) {
      const result = createBundleJobs(video, message.page, message.mode, jobs, {
        kinds: message.kinds,
        selectedPages: message.selectedPages,
        quality: message.quality,
        subtitleLanguage: message.subtitleLanguage,
        settings: await readSettings(),
      })
      if (result.jobs.length) {
        await openRunner(false)
        await writeJobs([...jobs, ...result.jobs])
      }
      return {
        added: result.jobs.length,
        skipped: result.skipped,
        bundleId: result.bundleId,
      }
    }
    if (message.type === 'queue.pause') {
      await writeJobs(pauseJob(jobs, message.id))
      return null
    }
    if (message.type === 'queue.resume') {
      const next = resumeJob(jobs, message.id)
      await openRunner(false)
      await writeJobs(next)
      return null
    }
    if (message.type === 'queue.move') {
      await writeJobs(moveQueuedJob(jobs, message.id, message.direction))
      return null
    }
    if (message.type === 'queue.cancel') {
      for (const job of jobs) {
        if (isJobActive(job) && (!message.id || job.id === message.id)) {
          job.status = 'cancelled'
        }
      }
      await writeJobs(jobs)
      return null
    }
    if (message.type === 'queue.clear') {
      await writeJobs(clearFinishedDownloadJobs(jobs))
      return null
    }
    if (
      message.type === 'queue.retry'
      || message.type === 'queue.retryFailed'
    ) {
      const next = retryDownloadJobs(
        jobs,
        message.type === 'queue.retry' ? message.id : undefined,
      )
      await openRunner(false)
      await writeJobs(next)
      return null
    }
    if (!isRunner(sender)) {
      throw new Error(i18n.t('downloads.downloadTasksCanOnlyRunInTheDownload'))
    }
    if (message.type === 'runner.ready') {
      await ensureHeaders()
      await recoverInterruptedJobs(jobs)
      await browser.storage.local.set({ [RUNNER_STORAGE_KEY]: sender.tab?.id })
      await writeJobs(jobs)
      return null
    }
    const stored = await browser.storage.local.get(RUNNER_STORAGE_KEY)
    if (stored[RUNNER_STORAGE_KEY] !== sender.tab?.id) {
      throw new Error(
        i18n.t('downloads.anotherDownloadCenterIsProcessingTheQueue'),
      )
    }
    if (message.type === 'native.start') {
      const job = startNativeJob(jobs, message.id)
      await writeJobs(jobs.map(item => (item.id === job.id ? job : item)))
      return job
    }
    if (message.type === 'native.update') {
      const job = jobs.find(item => item.id === message.id)
      if (!job || !applyNativeJobUpdate(job, message.runId, message.update)) {
        return false
      }
      await writeJobs(jobs)
      if (job.status === 'completed') {
        notifyCompleted(job).catch(console.warn)
      }
      return true
    }
    if (message.type === 'runner.claim') {
      const settings = await readSettings()
      const job = getNextQueuedJob(jobs, settings.isPaused)
      if (!job) {
        return null
      }
      job.status = 'resolving'
      job.runId = crypto.randomUUID()
      await writeJobs(jobs)
      return job
    }
    if (message.type === 'runner.update') {
      const job = jobs.find(item => item.id === message.id)
      if (!job || !canApplyJobUpdate(job, message.runId)) {
        return false
      }
      Object.assign(job, message.update)
      await writeJobs(jobs)
      if (job.status === 'completed') {
        // Notification delivery is best-effort; a saved file must stay completed.
        notifyCompleted(job).catch(console.warn)
      }
      return true
    }
    throw new Error(i18n.t('downloads.unsupportedDownloadAction'))
  })
}

async function notifyCompleted(job: DownloadJob) {
  if (
    !(await readSettings()).notifyOnComplete
    || !(await browser.permissions.contains({ permissions: ['notifications'] }))
  ) {
    return
  }
  await browser.notifications.create(`download:${job.id}`, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icons/128.png'),
    title: i18n.t('downloads.saved', [DOWNLOAD_KIND_LABELS[job.kind]]),
    message: `${job.title}${job.kind !== 'cover' && job.pageCount > 1 ? ` · P${job.page} ${job.part}` : ''}`,
  })
}

export function registerDownloads(ready: Promise<void> = Promise.resolve()) {
  browser.runtime.onMessage.addListener(
    (raw: unknown, sender, sendResponse) => {
      const channel = z
        .object({ channel: z.literal('bilibili-download') })
        .safeParse(raw)
      if (!channel.success || sender.id !== browser.runtime.id) {
        return
      }
      ready
        .then(async () => {
          const parsed = requestSchema.safeParse(raw)
          if (!parsed.success) {
            sendResponse({
              ok: false,
              error: i18n.t('downloads.invalidDownloadRequestParameters'),
            })
            return
          }
          const data = await handleRequest(parsed.data, sender)
          sendResponse({ ok: true, data })
        })
        .catch(error => {
          sendResponse({ ok: false, error: getErrorMessage(error) })
        })
      return true
    },
  )
  const handleRunnerClosed = (tabId: number) => {
    serialize(async () => {
      const stored = await browser.storage.local.get(RUNNER_STORAGE_KEY)
      if (stored[RUNNER_STORAGE_KEY] !== tabId) {
        return
      }
      const jobs = await readJobs()
      await recoverInterruptedJobs(jobs, true)
      await writeJobs(jobs)
      await browser.storage.local.remove(RUNNER_STORAGE_KEY)
    }).catch(console.error)
  }
  browser.tabs.onRemoved.addListener(handleRunnerClosed)
  browser.tabs.onUpdated.addListener((tabId, changes) => {
    if (
      changes.url
      && changes.url !== browser.runtime.getURL('/downloads.html')
    ) {
      handleRunnerClosed(tabId)
    }
  })
}
