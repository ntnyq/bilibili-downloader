import type {
  DownloadJob,
  DownloadKind,
  FolderMode,
  JobStatus,
  QualityPreference,
  SubtitleLanguage,
} from '~/types/download'

export const DOWNLOAD_KIND_LABELS: Record<DownloadKind, string> = {
  video: '视频 MP4',
  audio: '音频 M4A',
  cover: '视频封面',
  subtitle: '字幕 SRT',
  danmaku: '弹幕 XML',
}

export const SUBTITLE_LANGUAGE_LABELS: Record<SubtitleLanguage, string> = {
  auto: '自动（优先中文字幕）',
  zh: '中文',
  en: '英文',
}

export const DOWNLOAD_KIND_HINTS: Record<DownloadKind, string> = {
  video: '自动合并音视频 · 实际画质取决于当前账号权限',
  audio: '只下载最高码率 AAC 音轨，无损封装为 M4A；无独立 AAC 音轨时提示失败。',
  cover: '每个视频只保存一份封面原图，不随分 P 重复下载。',
  subtitle:
    '每个分 P 保存一份字幕，优先人工字幕；自动字幕会标注。无字幕或需要登录时提示失败。',
  danmaku: '保存当前可获取的弹幕 XML，不包含全部历史弹幕，也不会烧录到视频中。',
}

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

export const FOLDER_MODE_LABELS: Record<FolderMode, string> = {
  flat: '直接放入 Bilibili',
  owner: '按 UP 主建目录',
  video: '按视频建目录',
  'owner-video': '按 UP 主 / 视频建目录',
}

export const QUALITY_LABELS: Record<QualityPreference, string> = {
  best: '最高可用画质',
  '1080': '最高 1080P',
  '720': '最高 720P',
  '480': '最高 480P',
}

/**
 * Resolves asset-specific wording for active download phases.
 *
 * @param job - Job whose kind specializes resolving, downloading, or merging
 * wording.
 * @returns A phase-specific display label, or undefined so the caller can fall
 * back to STATUS_LABELS.
 */
export function getJobStatusLabel(job: DownloadJob): string | undefined {
  if (job.status === 'resolving') {
    return job.kind === 'video' ? '解析可用画质' : '读取素材信息'
  }
  if (job.status === 'downloading') {
    return job.kind === 'video'
      ? '下载音视频'
      : `下载${DOWNLOAD_KIND_LABELS[job.kind]}`
  }
  if (job.status === 'merging') {
    return job.kind === 'audio' ? '封装 M4A' : '合并 MP4'
  }
}
