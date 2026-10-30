import { MAX_PENDING_JOBS } from '../constants'
import { getJobIdentity } from '../queue/identity'
import {
  createDownloadJobs,
  isJobActive,
  selectVideoPages,
} from '../queue/jobs'
import type {
  DownloadJob,
  DownloadKind,
  FolderMode,
  QualityPreference,
  SubtitleLanguage,
  VideoInfo,
} from '~/types/download'

export class BatchQueueFullError extends Error {
  constructor() {
    super('下载队列已满，请等待部分任务完成后再添加。')
    this.name = 'BatchQueueFullError'
  }
}

/**
 * Add one resolved video atomically, using only known history to skip
 * completed work.
 *
 * @param video - Fresh canonical video metadata and all known parts.
 * @param item - Resolved source candidate carrying the requested current part
 * number.
 * @param item.page - One-based source part number used when options.mode is
 * current.
 * @param existing - Current queue used to skip active assets and, when needed,
 * completed jobs.
 * @param options - Batch selection and settings snapshot applied to every
 * created job.
 * @param options.mode - Whether to queue the requested current part or every
 * part.
 * @param options.quality - Submitted video-quality preference.
 * @param options.kind - Asset kind; cover creates at most one job per video.
 * @param options.subtitleLanguage - Language used for subtitle identity and
 * selection.
 * @param options.skipCompleted - Whether known successful identities should be
 * skipped.
 * @param options.filenameTemplate - Filename template snapshotted into each
 * job.
 * @param options.folderMode - Output directory grouping snapshotted into each
 * job.
 * @param completedIdentities - Optional successful identities from the
 * long-term library; when supplied, replaces completed-queue fallback checks.
 * @returns New queued jobs and the number of parts/assets skipped, without
 * mutating the queue.
 * @throws {BatchQueueFullError} If adding all remaining parts would exceed
 *   MAX_PENDING_JOBS.
 * @throws {Error} If the requested part cannot be found.
 */
export function createBatchJobs(
  video: VideoInfo,
  item: { page: number },
  existing: DownloadJob[],
  options: {
    mode: 'current' | 'all'
    quality: QualityPreference
    kind: DownloadKind
    subtitleLanguage: SubtitleLanguage
    skipCompleted: boolean
    filenameTemplate: string
    folderMode: FolderMode
  },
  completedIdentities?: Iterable<string>,
): { jobs: DownloadJob[]; skipped: number } {
  const pages =
    options.kind === 'cover'
      ? video.pages.slice(0, 1)
      : selectVideoPages(video.pages, item.page, options.mode)
  if (!pages.length) {
    throw new Error('找不到当前分 P，请刷新视频页面后重试。')
  }
  const activeJobs = existing.filter(isJobActive)
  const blocked = new Set(
    existing
      .filter(
        job =>
          isJobActive(job)
          || (options.skipCompleted
            && completedIdentities === undefined
            && job.status === 'completed'),
      )
      .map(getJobIdentity),
  )
  if (options.skipCompleted && completedIdentities) {
    for (const identity of completedIdentities) {
      blocked.add(identity)
    }
  }
  const pending = pages.filter(
    page =>
      !blocked.has(
        getJobIdentity({
          bvid: video.bvid,
          cid: page.cid,
          kind: options.kind,
          subtitleLanguage: options.subtitleLanguage,
        }),
      ),
  )
  const skipped = pages.length - pending.length
  if (!pending.length) {
    return {
      jobs: [],
      skipped,
    }
  }
  if (activeJobs.length + pending.length > MAX_PENDING_JOBS) {
    throw new BatchQueueFullError()
  }
  const jobs = createDownloadJobs(
    { ...video, pages: pending },
    item.page,
    'all',
    [],
    {
      quality: options.quality,
      kind: options.kind,
      subtitleLanguage: options.subtitleLanguage,
      settings: {
        quality: options.quality,
        doubleClickKind: 'video',
        isPaused: false,
        filenameTemplate: options.filenameTemplate,
        folderMode: options.folderMode,
        notifyOnComplete: false,
      },
    },
  ).map(job => ({
    ...job,
    pageCount: video.pages.length,
  }))
  return {
    jobs,
    skipped,
  }
}
