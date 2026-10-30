import { getSubtitle } from '~/utils/bilibili/api'
import { detectCoverFormat } from '~/utils/bilibili/cover'
import { normalizeMediaUrl } from '~/utils/bilibili/streams'
import { subtitlesToSrt } from '~/utils/bilibili/subtitles'
import { fetchMediaBytes } from '../media/fetchMediaBytes'
import type { DownloadJob } from '~/types/download'

const MAX_ASSET_BYTES = 16 * 1024 * 1024

/**
 * Fetches and validates a cover, subtitle, or danmaku without saving the file.
 *
 * @param job - Cover, subtitle, or danmaku job whose source and output format
 * will be resolved.
 * @param signal - Cancellation signal for metadata lookup, transfer, and
 * post-fetch validation.
 * @param onProgress - Callback receiving decoded bytes downloaded so far for
 * this asset.
 * @returns A promise resolving to the validated output Blob, extension, and
 * quality/language/count label.
 * @throws {Error} If the asset kind/source is unsupported, a selected asset is
 *   unavailable, or image/XML/caption content is invalid or empty.
 * @throws {RangeError} If the asset exceeds MAX_ASSET_BYTES.
 * @throws {TypeError} If text is not valid UTF-8.
 * @throws {SyntaxError} If downloaded subtitle text is not JSON.
 * @throws {import('zod').ZodError} If subtitle metadata or cue data fails
 *   schema validation.
 * @throws The API/network error or abort reason if fetching is unsuccessful.
 */
export async function fetchAsset(
  job: DownloadJob,
  signal: AbortSignal,
  onProgress: (received: number) => void,
) {
  let url: string | undefined
  let label = ''
  if (job.kind === 'cover') {
    url = normalizeMediaUrl(job.cover)
  } else if (job.kind === 'subtitle') {
    const subtitle = await getSubtitle(
      job.bvid,
      job.cid,
      job.subtitleLanguage,
      signal,
    )
    url = subtitle.url
    label = subtitle.label
  } else if (job.kind === 'danmaku') {
    url = `https://comment.bilibili.com/${job.cid}.xml`
  }
  if (!url) {
    throw new Error('此视频没有可导出的封面。')
  }
  const bytes = await fetchMediaBytes(
    [url],
    signal,
    MAX_ASSET_BYTES,
    onProgress,
  )
  signal.throwIfAborted()
  if (job.kind === 'cover') {
    const format = detectCoverFormat(bytes)
    return {
      blob: new Blob([bytes], { type: format.mime }),
      extension: format.extension,
      quality: '封面原图',
    }
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (job.kind === 'subtitle') {
    return {
      blob: new Blob([subtitlesToSrt(JSON.parse(text))], {
        type: 'application/x-subrip;charset=utf-8',
      }),
      extension: 'srt',
      quality: label,
    }
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw new Error('弹幕 XML 格式无效，未保存文件。')
  }
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (
    document.querySelector('parsererror')
    || document.documentElement.tagName !== 'i'
  ) {
    throw new Error('弹幕接口返回格式无效，请稍后重试。')
  }
  const count = document.querySelectorAll('d').length
  if (!count) {
    throw new Error('此分 P 当前没有可导出的弹幕。')
  }
  return {
    blob: new Blob([text], { type: 'application/xml;charset=utf-8' }),
    extension: 'xml',
    quality: `${count} 条弹幕`,
  }
}
