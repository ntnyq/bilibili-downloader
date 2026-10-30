import { downloadSettingsSchema } from '~/types/download'
import { bundleKindsSchema } from '~/types/downloadBundle'
import { assertDownloadQueueCapacity } from './capacity'
import { createDownloadJobs, isJobActive, selectVideoPages } from './jobs'
import type {
  DownloadJob,
  DownloadKind,
  DownloadMode,
  DownloadSettings,
  FolderMode,
  QualityPreference,
  SubtitleLanguage,
  VideoInfo,
} from '~/types/download'
import type { DownloadBundleSummary } from '~/types/downloadBundle'

export interface CreateBundleOptions {
  kinds: DownloadKind[]
  selectedPages?: number[]
  quality?: QualityPreference
  subtitleLanguage?: SubtitleLanguage
  settings?: DownloadSettings
}

/**
 * Resolves a bundle directory mode that always groups output by video.
 *
 * @param folderMode - Single-asset directory preference to adapt for bundle
 * output.
 * @returns owner-video when owner grouping is requested, otherwise video.
 */
export function getBundleFolderMode(folderMode: FolderMode): FolderMode {
  return ['owner', 'owner-video'].includes(folderMode) ? 'owner-video' : 'video'
}

/**
 * Counts expected bundle tasks, deduplicating asset kinds and treating covers
 * as video-wide.
 *
 * @param kinds - Requested asset kinds; repeats count only once.
 * @param pageCount - Number of selected parts for assets other than the cover.
 * @returns One task for a requested cover plus pageCount for each other unique
 * asset kind.
 */
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
 *
 * @param video - Canonical video metadata and all available parts.
 * @param page - Current one-based part number used when mode is current.
 * @param mode - Whether to include the current part, all parts, or explicit
 * selected parts.
 * @param existing - Current queue used for active-asset deduplication and
 * capacity validation.
 * @param options - Asset kinds, part selection, quality/language preference,
 * and naming settings.
 * @param options.kinds - Requested asset kinds, validated and deduplicated
 * before job creation.
 * @param options.selectedPages - Optional one-based part numbers for selected
 * mode.
 * @param options.quality - Optional quality cap; defaults to best during job
 * creation.
 * @param options.subtitleLanguage - Optional subtitle language; defaults to
 * auto.
 * @param options.settings - Optional settings snapshot; defaults to validated
 * download defaults and uses video grouping.
 * @returns New jobs, skipped count, and a shared bundleId when at least one
 * new job exists; the queue is not mutated.
 * @throws {import('zod').ZodError} If asset kinds or default settings fail
 *   validation.
 * @throws {Error} If part selection is invalid, no requested part exists, or
 *   count/storage capacity would be exceeded.
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
    ? selectVideoPages(video.pages, page, mode, options.selectedPages)
    : []
  const settings = options.settings || downloadSettingsSchema.parse({})
  const jobs: DownloadJob[] = []
  for (const kind of kinds) {
    jobs.push(
      ...createDownloadJobs(video, page, mode, [...existing, ...jobs], {
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

/**
 * Aggregates bundle members into progress summaries without hiding failed or
 * missing members.
 *
 * @param jobs - Queue snapshot; jobs without bundleId are ignored.
 * @returns Newest-first bundle summaries containing member jobs, status,
 * progress, and completed/active/failed/cancelled/missing counts.
 */
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
