import { DEFAULT_FILENAME_TEMPLATE } from '../../types/download'
import { jobIdentity } from './assets'
import { isJobRunning } from './taskControl'
import type {
  DownloadJob,
  DownloadKind,
  DownloadMode,
  DownloadSettings,
  JobStatus,
  QualityPreference,
  SubtitleLanguage,
  VideoInfo,
  VideoPage,
} from '../../types/download'

export { createFilename } from './filename'

export const JOBS_STORAGE_KEY = 'downloadJobs'
export const SETTINGS_STORAGE_KEY = 'downloadSettings'
export const MAX_PENDING_JOBS = 1000

export const STATUS_LABELS: Record<JobStatus, string> = {
  queued: '等待下载',
  paused: '已暂停',
  native: '本地助手下载',
  resolving: '解析可用画质',
  downloading: '下载音视频',
  merging: '合并 MP4',
  saving: '保存文件',
  completed: '已保存',
  failed: '下载失败',
  cancelled: '已取消',
}

export function isJobActive(job: DownloadJob): boolean {
  return !['completed', 'failed', 'cancelled'].includes(job.status)
}

export function parseVideoLocation(value: string) {
  try {
    const url = new URL(value)
    if (url.hostname !== 'www.bilibili.com' || url.protocol !== 'https:') {
      return
    }
    const videoId = /^\/video\/(BV[\dA-Za-z]{10}|av\d+)(?:\/|$)/.exec(
      url.pathname,
    )?.[1]
    if (!videoId) {
      return
    }
    const page = Number(url.searchParams.get('p') || 1)
    if (!Number.isSafeInteger(page) || page < 1) {
      return
    }
    return {
      videoId,
      page,
    }
  } catch {
    return undefined
  }
}

export function createJobs(
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
      : selectPages(video.pages, page, mode, options.selectedPages)
  if (!pages.length) {
    throw new Error('找不到当前分 P，请刷新视频页面后重试。')
  }
  const active = new Set(existing.filter(isJobActive).map(jobIdentity))
  const pending = pages.filter(
    item =>
      !active.has(
        jobIdentity({
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

export function selectPages(
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
 * Retry failed history once per part, preserving the submitted quality preference.
 */
export function retryJobs(jobs: DownloadJob[], id?: string): DownloadJob[] {
  const active = new Set(jobs.filter(isJobActive).map(jobIdentity))
  let added = 0
  const next = jobs.map(job => {
    const eligible = id
      ? job.id === id && ['failed', 'cancelled'].includes(job.status)
      : job.status === 'failed'
    const key = jobIdentity(job)
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

export function nextQueuedJob(jobs: DownloadJob[], isPaused: boolean) {
  if (isPaused || jobs.some(isJobRunning)) {
    return undefined
  }
  return jobs.find(job => job.status === 'queued')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
