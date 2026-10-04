import { getSubtitle } from '../bilibili/api'
import { detectCoverFormat } from '../bilibili/cover'
import { normalizeMediaUrl } from '../bilibili/streams'
import { subtitlesToSrt } from '../bilibili/subtitles'
import { fetchMedia } from './fetchMedia'
import type { DownloadJob } from '../../types/download'

const MAX_ASSET_BYTES = 16 * 1024 * 1024

export async function exportAsset(
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
  const bytes = await fetchMedia([url], signal, MAX_ASSET_BYTES, onProgress)
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
