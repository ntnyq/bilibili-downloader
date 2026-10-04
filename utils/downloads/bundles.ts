import { downloadSettingsSchema } from '../../types/download'
import { bundleKindsSchema } from '../../types/downloadBundle'
import { createJobs, isJobActive, MAX_PENDING_JOBS, selectPages } from './model'
import type {
  DownloadJob,
  DownloadKind,
  DownloadMode,
  DownloadSettings,
  FolderMode,
  QualityPreference,
  SubtitleLanguage,
  VideoInfo,
} from '../../types/download'
import type { DownloadBundleSummary } from '../../types/downloadBundle'

export const MAX_DOWNLOAD_QUEUE_BYTES = 4 * 1024 * 1024
const ACTIVE_JOB_RESERVED_BYTES = 2048
const encoder = new TextEncoder()

export interface CreateBundleOptions {
  kinds: DownloadKind[]
  selectedPages?: number[]
  quality?: QualityPreference
  subtitleLanguage?: SubtitleLanguage
  settings?: DownloadSettings
}

export function getBundleFolderMode(folderMode: FolderMode): FolderMode {
  return ['owner', 'owner-video'].includes(folderMode) ? 'owner-video' : 'video'
}

export function getBundleTaskCount(
  kinds: DownloadKind[],
  pageCount: number,
): number {
  return [...new Set(kinds)].reduce(
    (total, kind) => total + (kind === 'cover' ? 1 : pageCount),
    0,
  )
}

/**
 * Build and validate the entire bundle before the caller commits the queue.
 * Existing active assets keep their original job and download directory.
 */
export function createBundleJobs(
  video: VideoInfo,
  page: number,
  mode: DownloadMode,
  existing: DownloadJob[],
  options: CreateBundleOptions,
): { jobs: DownloadJob[]; skipped: number; bundleId?: string } {
  const kinds = bundleKindsSchema.parse(options.kinds)
  const pages = kinds.some(kind => kind !== 'cover')
    ? selectPages(video.pages, page, mode, options.selectedPages)
    : []
  const settings = options.settings || downloadSettingsSchema.parse({})
  const jobs: DownloadJob[] = []
  for (const kind of kinds) {
    jobs.push(
      ...createJobs(video, page, mode, [...existing, ...jobs], {
        ...options,
        kind,
        settings: {
          ...settings,
          folderMode: getBundleFolderMode(settings.folderMode),
        },
      }),
    )
  }
  const skipped = getBundleTaskCount(kinds, pages.length) - jobs.length
  if (!jobs.length) {
    return {
      jobs,
      skipped,
    }
  }
  const bundleId = crypto.randomUUID()
  const bundledJobs = jobs.map(job => ({
    ...job,
    bundleId,
    bundleSize: jobs.length,
  }))
  assertDownloadQueueCapacity(existing, [...existing, ...bundledJobs])
  return {
    jobs: bundledJobs,
    skipped,
    bundleId,
  }
}

export function summarizeDownloadBundles(
  jobs: DownloadJob[],
): DownloadBundleSummary[] {
  const groups = new Map<string, DownloadJob[]>()
  for (const job of jobs) {
    if (!job.bundleId) {
      continue
    }
    const group = groups.get(job.bundleId) || []
    group.push(job)
    groups.set(job.bundleId, group)
  }
  const summaries: DownloadBundleSummary[] = []
  for (const [id, group] of groups) {
    const first = group[0]
    if (!first) {
      continue
    }
    const total = Math.max(
      group.length,
      ...group.map(job => job.bundleSize || group.length),
    )
    const completed = group.filter(job => job.status === 'completed').length
    const failed = group.filter(job => job.status === 'failed').length
    const cancelled = group.filter(job => job.status === 'cancelled').length
    const activeJobs = group.filter(isJobActive)
    const missing = total - group.length
    const status = activeJobs.length
      ? 'active'
      : missing
        ? 'incomplete'
        : failed
          ? 'failed'
          : cancelled
            ? 'cancelled'
            : 'completed'
    const progress = Math.floor(
      (completed * 100
        + activeJobs.reduce(
          (sum, job) => sum + Math.max(0, Math.min(99, job.progress)),
          0,
        ))
        / total,
    )
    summaries.push({
      id,
      bvid: first.bvid,
      title: first.title,
      createdAt: Math.max(...group.map(job => job.createdAt)),
      total,
      completed,
      failed,
      cancelled,
      active: activeJobs.length,
      missing,
      progress,
      status,
      jobs: group,
    })
  }
  return summaries.sort((left, right) => right.createdAt - left.createdAt)
}

/**
 * Keep completed members while their bundle is still active, including on clear.
 */
export function clearFinishedDownloadJobs(jobs: DownloadJob[]): DownloadJob[] {
  const activeBundles = new Set(
    jobs
      .filter(isJobActive)
      .flatMap(job => (job.bundleId ? [job.bundleId] : [])),
  )
  return jobs.filter(
    job =>
      isJobActive(job) || (job.bundleId && activeBundles.has(job.bundleId)),
  )
}

/**
 * New work reserves space for every member of an unfinished bundle, including
 * saved members. Existing over-budget queues can still make progress or cancel.
 */
export function assertDownloadQueueCapacity(
  previousJobs: DownloadJob[],
  nextJobs: DownloadJob[],
) {
  const previousActive = new Set(
    previousJobs.filter(isJobActive).map(job => job.id),
  )
  if (!nextJobs.some(job => isJobActive(job) && !previousActive.has(job.id))) {
    return
  }
  const retained = clearFinishedDownloadJobs(nextJobs)
  if (retained.length > MAX_PENDING_JOBS) {
    throw new Error(
      '下载队列已满。素材组合全部结束后会释放名额，请先继续或取消未完成任务。',
    )
  }
  const bytes = encoder.encode(JSON.stringify(retained)).byteLength
  const reserve =
    retained.filter(isJobActive).length * ACTIVE_JOB_RESERVED_BYTES
  if (bytes + reserve > MAX_DOWNLOAD_QUEUE_BYTES) {
    throw new Error('下载队列已达到存储上限，请先完成或取消部分任务后再添加。')
  }
}

/**
 * Evict whole finished bundles instead of truncating their progress records.
 * The history limit may be exceeded by one group to avoid splitting it.
 */
export function pruneDownloadJobs(
  jobs: DownloadJob[],
  limit = 100,
): DownloadJob[] {
  const retained = new Set(clearFinishedDownloadJobs(jobs))
  let retainedBytes = encoder.encode(JSON.stringify([...retained])).byteLength
  const finished = new Map<string, DownloadJob[]>()
  for (const job of jobs) {
    if (retained.has(job)) {
      continue
    }
    const key = job.bundleId ? `bundle:${job.bundleId}` : `job:${job.id}`
    const group = finished.get(key) || []
    group.push(job)
    // Updating insertion order makes the group's newest member its recency.
    finished.delete(key)
    finished.set(key, group)
  }
  let historyCount = 0
  for (const group of [...finished.values()].reverse()) {
    if (historyCount >= limit) {
      break
    }
    const groupBytes = encoder.encode(JSON.stringify(group)).byteLength
    if (retainedBytes + groupBytes > MAX_DOWNLOAD_QUEUE_BYTES) {
      continue
    }
    for (const job of group) {
      retained.add(job)
    }
    historyCount += group.length
    retainedBytes += groupBytes
  }
  return jobs.filter(job => retained.has(job))
}
