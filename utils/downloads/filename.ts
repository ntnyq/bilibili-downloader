import { DOWNLOAD_KIND_LABELS } from './assets'
import type { DownloadJob, FolderMode } from '../../types/download'

export const FOLDER_MODE_LABELS: Record<FolderMode, string> = {
  flat: '直接放入 Bilibili',
  owner: '按 UP 主建目录',
  video: '按视频建目录',
  'owner-video': '按 UP 主 / 视频建目录',
}

/**
 * Sanitize each path component independently and bound its UTF-8 byte length.
 */
export function sanitizeFilename(value: string, limit = 220): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
  let result = ''
  for (const char of sanitized) {
    if (new TextEncoder().encode(result + char).length > limit) {
      break
    }
    result += char
  }
  result = result.replace(/[. ]+$/g, '') || '视频'
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)
    ? `_${result}`
    : result
}

export function createFilename(
  job: Pick<
    DownloadJob,
    | 'kind'
    | 'pageCount'
    | 'page'
    | 'part'
    | 'bvid'
    | 'title'
    | 'owner'
    | 'quality'
    | 'filenameTemplate'
    | 'folderMode'
  >,
  extension?: string,
): string {
  const isMultipart = job.kind !== 'cover' && job.pageCount > 1
  const values = {
    title: sanitizeFilename(job.title, 90),
    bvid: job.bvid,
    page: job.kind === 'cover' ? '' : `P${String(job.page).padStart(2, '0')}`,
    part: job.kind === 'cover' ? '' : sanitizeFilename(job.part, 60),
    partSuffix: isMultipart
      ? `_P${String(job.page).padStart(2, '0')}_${sanitizeFilename(job.part, 60)}`
      : '',
    owner: sanitizeFilename(job.owner || '未知 UP', 60),
    quality: sanitizeFilename(
      job.quality
        || (job.kind === 'video' ? '最高画质' : DOWNLOAD_KIND_LABELS[job.kind]),
      40,
    ),
    type: DOWNLOAD_KIND_LABELS[job.kind],
  }
  const variables = new Map(Object.entries(values))
  const name = sanitizeFilename(
    job.filenameTemplate.replace(
      /\{(\w+)\}/g,
      (_, key: string) => variables.get(key) || '',
    ),
  )
  const folders = ['Bilibili']
  if (['owner', 'owner-video'].includes(job.folderMode)) {
    folders.push(values.owner || '未知 UP')
  }
  if (['video', 'owner-video'].includes(job.folderMode)) {
    folders.push(`${values.title}_${job.bvid}`)
  }
  const extensions = {
    video: 'mp4',
    audio: 'm4a',
    cover: 'jpg',
    subtitle: 'srt',
    danmaku: 'xml',
  }
  const suffix = extension || extensions[job.kind]
  if (!/^(?:mp4|m4a|jpg|png|webp|gif|srt|xml)$/.test(suffix)) {
    throw new Error('不支持的文件格式。')
  }
  return [...folders, `${name}.${suffix}`].join('/')
}
