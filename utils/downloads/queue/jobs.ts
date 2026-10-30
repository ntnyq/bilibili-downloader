import { DEFAULT_FILENAME_TEMPLATE } from '~/types/download'
import { MAX_PENDING_JOBS } from '../constants'
import { isJobRunning } from './control'
import { getJobIdentity } from './identity'

import type {
  DownloadJob,
  DownloadKind,
  DownloadMode,
  DownloadSettings,
  QualityPreference,
  SubtitleLanguage,
  VideoInfo,
  VideoPage,
} from '~/types/download'

/**
 * Checks whether a job still occupies active download work rather than
 * terminal history.
 *
 * @param job - Queue job whose status determines identity and capacity
 * reservation.
 * @returns False for completed, failed, or cancelled jobs; true for every
 * other status, including paused and native.
 */
export function isJobActive(job: DownloadJob): boolean {
  return !['completed', 'failed', 'cancelled'].includes(job.status)
}

/**
 * Creates queued assets for selected video parts while deduplicating active
 * identities.
 *
 * @param video - Canonical video metadata and available parts.
 * @param page - Current one-based part number used for current mode.
 * @param mode - Part-selection mode: current, all, or selected.
 * @param existing - Current queue used for active-identity deduplication and
 * capacity checks.
 * @param options - Optional asset selection and settings snapshot; defaults to
 * an empty object.
 * @param options.selectedPages - One-based part numbers required for selected
 * mode.
 * @param options.quality - Quality preference snapshotted into new jobs;
 * defaults to best.
 * @param options.kind - Asset kind; defaults to video, while cover uses only
 * the first part.
 * @param options.subtitleLanguage - Subtitle identity/language preference;
 * defaults to auto.
 * @param options.settings - Optional naming settings; absent/empty values fall
 * back to DEFAULT_FILENAME_TEMPLATE and flat folders.
 * @returns New queued job objects with fresh IDs and reset progress,
 * preserving part order without mutating existing.
 * @throws {Error} If part selection is empty/stale, the requested part is
 *   missing, or active capacity would be exceeded.
 */
export function createDownloadJobs(
  video: VideoInfo,
  page: number,
  mode: DownloadMode,
  existing: DownloadJob[],
  options: {
    selectedPages?: number[]
    quality?: QualityPreference
    kind?: DownloadKind
    subtitleLanguage?: SubtitleLanguage
    settings?: DownloadSettings
  } = {},
): DownloadJob[] {
  const kind = options.kind || 'video'
  const subtitleLanguage = options.subtitleLanguage || 'auto'
  const pages =
    kind === 'cover'
      ? video.pages.slice(0, 1)
      : selectVideoPages(video.pages, page, mode, options.selectedPages)
  if (!pages.length) {
    throw new Error('找不到当前分 P，请刷新视频页面后重试。')
  }
  const active = new Set(existing.filter(isJobActive).map(getJobIdentity))
  const pending = pages.filter(
    item =>
      !active.has(
        getJobIdentity({
          bvid: video.bvid,
          cid: item.cid,
          kind,
          subtitleLanguage,
        }),
      ),
  )
  if (active.size + pending.length > MAX_PENDING_JOBS) {
    throw new Error('下载队列已满，请等待部分任务完成后再添加。')
  }
  return pending.map(item => ({
    ...item,
    id: crypto.randomUUID(),
    bvid: video.bvid,
    title: video.title,
    cover: video.cover,
    owner: video.owner,
    kind,
    subtitleLanguage,
    filenameTemplate:
      options.settings?.filenameTemplate || DEFAULT_FILENAME_TEMPLATE,
    folderMode: options.settings?.folderMode || 'flat',
    pageCount: video.pages.length,
    createdAt: Date.now(),
    status: 'queued',
    progress: 0,
    receivedBytes: 0,
    totalBytes: 0,
    qualityPreference: options.quality || 'best',
  }))
}

/**
 * Resolves the requested parts while retaining canonical video order.
 *
 * @param pages - Available part metadata in video order.
 * @param currentPage - One-based part number used only in current mode.
 * @param mode - current for a matching part, all for the input list, or
 * selected for explicit choices.
 * @param selectedPages - Optional one-based choices for selected mode;
 * duplicates are collapsed and defaults to an empty list.
 * @returns Selected part metadata; all returns the original array and a
 * missing current part returns an empty array.
 * @throws {Error} If selected mode has no choices or references unavailable
 *   parts.
 */
export function selectVideoPages(
  pages: VideoPage[],
  currentPage: number,
  mode: DownloadMode,
  selectedPages: number[] = [],
): VideoPage[] {
  if (mode === 'selected') {
    const selected = new Set(selectedPages)
    if (!selected.size) {
      throw new Error('请至少选择一个分 P。')
    }
    if ([...selected].some(page => !pages.some(item => item.page === page))) {
      throw new Error('所选分 P 已失效，请重新读取视频信息。')
    }
    return pages.filter(page => selected.has(page.page))
  }
  return mode === 'all'
    ? pages
    : pages.filter(page => page.page === currentPage)
}

/**
 * Retry failed history once per part, preserving the submitted quality
 * preference.
 *
 * @param jobs - Current queue used for active-identity deduplication and
 * capacity validation.
 * @param id - Optional specific failed/cancelled job to retry; omission
 * retries failed jobs only.
 * @returns A copied queue with eligible unique jobs reset to queued and
 * obsolete execution/output fields cleared.
 * @throws {Error} If active capacity would overflow or a requested job is
 *   ineligible, missing, or already active by identity.
 */
export function retryDownloadJobs(
  jobs: DownloadJob[],
  id?: string,
): DownloadJob[] {
  const active = new Set(jobs.filter(isJobActive).map(getJobIdentity))
  let added = 0
  const next = jobs.map(job => {
    const eligible = id
      ? job.id === id && ['failed', 'cancelled'].includes(job.status)
      : job.status === 'failed'
    const key = getJobIdentity(job)
    if (!eligible || active.has(key)) {
      return job
    }
    active.add(key)
    added++
    return {
      ...job,
      status: 'queued' as const,
      runId: undefined,
      progress: 0,
      receivedBytes: 0,
      totalBytes: 0,
      quality: undefined,
      error: undefined,
      downloadId: undefined,
      filename: undefined,
    }
  })
  if (active.size > MAX_PENDING_JOBS) {
    throw new Error('下载队列已满，请等待部分任务完成后再重试。')
  }
  if (id && !added) {
    throw new Error('此任务无需重试，或此分 P 已在下载队列中。')
  }
  return next
}

/**
 * Selects the first queued browser job when queue scheduling may advance.
 *
 * @param jobs - Current queue in scheduling order.
 * @param isPaused - Whether global queue scheduling is paused.
 * @returns The first queued job, or undefined if paused, a browser job is
 * running, or no queued job remains.
 */
export function getNextQueuedJob(jobs: DownloadJob[], isPaused: boolean) {
  if (isPaused || jobs.some(isJobRunning)) {
    return undefined
  }
  return jobs.find(job => job.status === 'queued')
}
