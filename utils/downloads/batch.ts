import { jobIdentity } from './assets'
import { createJobs, isJobActive, MAX_PENDING_JOBS, selectPages } from './model'
import type {
  DownloadJob,
  DownloadKind,
  FolderMode,
  QualityPreference,
  SubtitleLanguage,
  VideoInfo,
} from '../../types/download'

export class BatchQueueFullError extends Error {
  constructor() {
    super('下载队列已满，请等待部分任务完成后再添加。')
    this.name = 'BatchQueueFullError'
  }
}

/**
 * Add one resolved video atomically, using only known history to skip completed work.
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
      : selectPages(video.pages, item.page, options.mode)
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
      .map(jobIdentity),
  )
  if (options.skipCompleted && completedIdentities) {
    for (const identity of completedIdentities) {
      blocked.add(identity)
    }
  }
  const pending = pages.filter(
    page =>
      !blocked.has(
        jobIdentity({
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
  const jobs = createJobs({ ...video, pages: pending }, item.page, 'all', [], {
    quality: options.quality,
    kind: options.kind,
    subtitleLanguage: options.subtitleLanguage,
    settings: {
      quality: options.quality,
      isPaused: false,
      filenameTemplate: options.filenameTemplate,
      folderMode: options.folderMode,
      notifyOnComplete: false,
    },
  }).map(job => ({
    ...job,
    pageCount: video.pages.length,
  }))
  return {
    jobs,
    skipped,
  }
}
