import { z } from 'zod'
import { QUALITY_LABELS, QUALITY_RESOLUTIONS } from '../downloads/quality'
import type { QualityPreference } from '../../types/download'

export const MEDIA_DOMAINS = [
  'bilivideo.com',
  'bilivideo.cn',
  'bilivideo.net',
  'akamaized.net',
  'hdslb.com',
]

export function normalizeMediaUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol)
      || url.username
      || url.password
      || (url.port && url.port !== '443')
      || !MEDIA_DOMAINS.some(
        domain =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    ) {
      return
    }
    url.protocol = 'https:'
    return url.href
  } catch {
    return undefined
  }
}

const streamSchema = z.object({
  id: z.number(),
  baseUrl: z.string().optional(),
  base_url: z.string().optional(),
  backupUrl: z.array(z.string()).nullish(),
  backup_url: z.array(z.string()).nullish(),
  codecs: z.string().default(''),
  bandwidth: z.number().nonnegative().default(0),
  width: z.number().nonnegative().default(0),
  height: z.number().nonnegative().default(0),
  frameRate: z.union([z.string(), z.number()]).optional(),
  frame_rate: z.union([z.string(), z.number()]).optional(),
})

export const playDataSchema = z.object({
  quality: z.number().optional(),
  is_preview: z.union([z.boolean(), z.number()]).optional(),
  is_drm: z.union([z.boolean(), z.number()]).optional(),
  dash: z
    .object({
      video: z.array(streamSchema).default([]),
      audio: z.array(streamSchema).nullish(),
    })
    .nullish(),
  durl: z
    .array(
      z.object({
        url: z.string(),
        backup_url: z.array(z.string()).nullish(),
        size: z.number().nonnegative().optional(),
      }),
    )
    .optional(),
  support_formats: z
    .array(
      z.object({
        quality: z.number(),
        new_description: z.string().optional(),
        display_desc: z.string().optional(),
      }),
    )
    .default([]),
})

export interface MediaInput {
  /**
   * Representation identity excludes expiring URL queries and CDN hostnames.
   */
  id: string
  urls: string[]
  bandwidth: number
}

export interface SelectedMedia {
  kind: 'dash' | 'progressive' | 'audio'
  inputs: MediaInput[]
  quality: string
}

/**
 * Audio exports require a returned AAC stream and never fetch the video track.
 */
export function selectAudio(
  data: z.infer<typeof playDataSchema>,
): SelectedMedia {
  if (data.is_preview || data.is_drm) {
    throw new Error('此视频只返回试看或受保护内容，无法导出完整音频。')
  }
  const audio = (data.dash?.audio || [])
    .filter(
      stream =>
        stream.codecs.startsWith('mp4a') && streamUrls(stream).length > 0,
    )
    .toSorted((a, b) => b.bandwidth - a.bandwidth)[0]
  if (!audio) {
    throw new Error(
      '未获得独立 AAC 音轨，无法导出 M4A。请登录后重试，或下载视频 MP4。',
    )
  }
  return {
    kind: 'audio',
    inputs: [toMediaInput(audio)],
    quality: audio.bandwidth
      ? `AAC ${Math.round(audio.bandwidth / 1000)} kbps`
      : 'AAC',
  }
}

type Stream = z.infer<typeof streamSchema>

function streamUrls(stream: Stream): string[] {
  return [
    stream.baseUrl || stream.base_url || '',
    ...(stream.backupUrl || stream.backup_url || []),
  ]
    .map(normalizeMediaUrl)
    .filter((url): url is string => !!url)
}

function toMediaInput(stream: Stream): MediaInput {
  const urls = streamUrls(stream)
  const firstUrl = urls[0]
  if (!firstUrl) {
    throw new Error('未获得可用媒体地址。')
  }
  return {
    id: JSON.stringify([
      stream.id,
      stream.codecs,
      stream.width,
      stream.height,
      frameRate(stream),
      stream.bandwidth,
      new URL(firstUrl).pathname,
    ]),
    urls,
    bandwidth: stream.bandwidth,
  }
}

function frameRate(stream: Stream): number {
  const [numerator = 0, denominator = 1] = String(
    stream.frameRate || stream.frame_rate || 0,
  )
    .split('/')
    .map(Number)
  return denominator ? numerator / denominator : 0
}

function codecRank(stream: Stream): number {
  if (stream.codecs.startsWith('avc')) {
    return 3
  }
  if (/^(?:hev|hvc)/.test(stream.codecs)) {
    return 2
  }
  return 1
}

/**
 * Choose only returned media; advertised VIP formats do not imply access.
 * Rank resolution and frame rate first; prefer SDR and AVC among equal formats.
 */
export function selectMedia(
  data: z.infer<typeof playDataSchema>,
  preference: QualityPreference = 'best',
): SelectedMedia {
  if (data.is_preview || data.is_drm) {
    throw new Error('此视频只返回试看或受保护内容，无法下载完整视频。')
  }
  const videos = (data.dash?.video || []).filter(
    stream =>
      streamUrls(stream).length > 0
      && /^(?:avc|hev|hvc|av01)/.test(stream.codecs)
      && (preference === 'best'
        || (stream.width > 0
          && stream.height > 0
          && Math.min(stream.width, stream.height) <= Number(preference))),
  )
  const video = videos.toSorted(
    (a, b) =>
      b.width * b.height - a.width * a.height
      || frameRate(b) - frameRate(a)
      || Number([125, 126].includes(a.id)) - Number([125, 126].includes(b.id))
      || b.id - a.id
      || codecRank(b) - codecRank(a)
      || b.bandwidth - a.bandwidth,
  )[0]
  const qualityName = (id: number) => {
    const format = data.support_formats.find(item => item.quality === id)
    return format?.new_description || format?.display_desc || `画质 ${id}`
  }
  if (video) {
    const audio = (data.dash?.audio || [])
      .filter(
        stream =>
          stream.codecs.startsWith('mp4a') && streamUrls(stream).length > 0,
      )
      .toSorted((a, b) => b.bandwidth - a.bandwidth)[0]
    if (!audio) {
      throw new Error('未获得可用 AAC 音轨，请登录 B 站后重试。')
    }
    return {
      kind: 'dash',
      quality: qualityName(video.id),
      inputs: [video, audio].map(toMediaInput),
    }
  }
  if (data.durl?.length) {
    const resolution = QUALITY_RESOLUTIONS[data.quality || 0]
    if (
      preference !== 'best'
      && (!resolution || resolution > Number(preference))
    ) {
      throw new Error(
        `未返回符合「${QUALITY_LABELS[preference]}」的流，请更改画质后重新添加任务。`,
      )
    }
    const inputs = data.durl.map((stream, index) => ({
      id: JSON.stringify([
        'progressive',
        data.quality || 0,
        index,
        stream.size || 0,
        new URL(normalizeMediaUrl(stream.url) || 'https://invalid/').pathname,
      ]),
      urls: [stream.url, ...(stream.backup_url || [])]
        .map(normalizeMediaUrl)
        .filter((url): url is string => !!url),
      bandwidth: 0,
    }))
    if (inputs.some(input => !input.urls.length)) {
      throw new Error('视频 CDN 尚未支持，请更新扩展后重试。')
    }
    return {
      kind: 'progressive',
      quality: qualityName(data.quality || 0),
      inputs,
    }
  }
  if (preference !== 'best') {
    throw new Error(
      `未返回符合「${QUALITY_LABELS[preference]}」的流，请更改画质后重新添加任务。`,
    )
  }
  throw new Error('未获得可下载的视频流，请登录 B 站并确认视频可以播放。')
}
