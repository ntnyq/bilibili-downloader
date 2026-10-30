import { DOWNLOAD_KIND_LABELS } from '../labels'
import type { DownloadJob } from '~/types/download'

/**
 * Sanitize each path component independently and bound its UTF-8 byte length.
 *
 * @param value - One filename or directory component; path separators and
 * control characters are replaced.
 * @param limit - UTF-8 byte budget before reserved-name prefixing; defaults to
 * 220.
 * @returns A cleaned component with trailing dots/spaces removed, a fallback
 * for empty text, and a prefix for reserved device names.
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

/**
 * Builds a safe browser-download path, including folders and the extension.
 *
 * @param job - Asset identity, video/part metadata, naming template, directory
 * mode, and optional quality label.
 * @param extension - Optional supported extension without a dot; defaults to
 * the extension for the asset kind.
 * @returns A slash-separated path beneath Bilibili, including sanitized
 * folders and the final extension.
 * @throws {Error} If the output extension is outside the supported media and
 *   asset formats.
 */
export function createDownloadPath(
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
