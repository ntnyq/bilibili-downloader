import { z } from 'zod'
import { i18n } from '~/utils/i18n'
import { QUALITY_LABELS } from '../downloads/labels'
import { QUALITY_RESOLUTIONS } from '../downloads/media/quality'
import type { QualityPreference } from '../../types/download'

export const MEDIA_DOMAINS = [
  'bilivideo.com',
  'bilivideo.cn',
  'bilivideo.net',
  'akamaized.net',
  'hdslb.com',
]

/**
 * Validates a media CDN URL and upgrades an accepted HTTP URL to HTTPS.
 *
 * @param value - Absolute media URL to validate against MEDIA_DOMAINS.
 * @returns The normalized HTTPS URL, or undefined for malformed URLs,
 * unsupported hosts/ports, or embedded credentials.
 */
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
 *
 * @param data - Validated playback payload containing the returned audio
 * representations.
 * @returns An audio selection containing the highest-bandwidth usable AAC
 * input and its label.
 * @throws {Error} If playback is preview/DRM-only or no trusted standalone AAC
 *   stream is available.
 */
export function selectAudio(
  data: z.infer<typeof playDataSchema>,
): SelectedMedia {
  if (data.is_preview || data.is_drm) {
    throw new Error(
      i18n.t('streams.thisVideoProvidesOnlyPreviewOrProtectedContent'),
    )
  }
  const audio = (data.dash?.audio || [])
    .filter(
      stream =>
        stream.codecs.startsWith('mp4a') && streamUrls(stream).length > 0,
    )
    .toSorted((a, b) => b.bandwidth - a.bandwidth)[0]
  if (!audio) {
    throw new Error(i18n.t('streams.noSeparateAacTrackIsAvailableForM4a'))
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

/**
 * Collects trusted primary and backup URLs from either API field naming
 * convention.
 *
 * @param stream - DASH representation with camelCase or snake_case CDN fields.
 * @returns Normalized HTTPS URLs in primary-then-backup order, with
 * unsupported URLs removed.
 */
function streamUrls(stream: Stream): string[] {
  return [
    stream.baseUrl || stream.base_url || '',
    ...(stream.backupUrl || stream.backup_url || []),
  ]
    .map(normalizeMediaUrl)
    .filter((url): url is string => !!url)
}

/**
 * Converts a DASH representation into a stable identity and trusted URL
 * candidates.
 *
 * @param stream - Representation whose codec, dimensions, frame rate, and
 * first media path define identity.
 * @returns A media input whose identity excludes CDN hosts and expiring query
 * parameters.
 * @throws {Error} If the representation has no supported media URL.
 */
function toMediaInput(stream: Stream): MediaInput {
  const urls = streamUrls(stream)
  const firstUrl = urls[0]
  if (!firstUrl) {
    throw new Error(i18n.t('streams.noUsableMediaUrlWasReturned'))
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

/**
 * Reads a numeric or fractional frame rate from a DASH representation.
 *
 * @param stream - Representation carrying frameRate or frame_rate, such as 60
 * or 30000/1001.
 * @returns The parsed frame rate, zero for a missing value or zero
 * denominator, or NaN for nonnumeric components.
 */
function frameRate(stream: Stream): number {
  const [numerator = 0, denominator = 1] = String(
    stream.frameRate || stream.frame_rate || 0,
  )
    .split('/')
    .map(Number)
  return denominator ? numerator / denominator : 0
}

/**
 * Ranks equally sized video representations by preferred codec family.
 *
 * @param stream - Representation whose codec prefix determines the preference.
 * @returns 3 for AVC, 2 for HEVC, and 1 for other codecs.
 */
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
 * Choose only returned media; advertised VIP formats do not imply access. Rank
 * resolution and frame rate first; prefer SDR and AVC among equal formats.
 *
 * @param data - Validated playback payload containing returned DASH tracks or
 * progressive fragments.
 * @param preference - Maximum eligible resolution, or best to avoid a cap;
 * defaults to best.
 * @returns Selected video/audio DASH inputs or all progressive fragments with
 * a quality label.
 * @throws {Error} If content is protected/preview-only, no tracks satisfy the
 *   quality cap, AAC is missing, or any required fragment has no trusted URL.
 */
export function selectMedia(
  data: z.infer<typeof playDataSchema>,
  preference: QualityPreference = 'best',
): SelectedMedia {
  if (data.is_preview || data.is_drm) {
    throw new Error(
      i18n.t('streams.thisVideoProvidesOnlyPreviewOrProtectedContent2'),
    )
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
    return (
      format?.new_description
      || format?.display_desc
      || i18n.t('streams.quality', [id])
    )
  }
  if (video) {
    const audio = (data.dash?.audio || [])
      .filter(
        stream =>
          stream.codecs.startsWith('mp4a') && streamUrls(stream).length > 0,
      )
      .toSorted((a, b) => b.bandwidth - a.bandwidth)[0]
    if (!audio) {
      throw new Error(i18n.t('streams.noUsableAacTrackWasReturnedSignIn'))
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
        i18n.t('streams.noStreamMatchesChangeTheQualitySettingAnd', [
          QUALITY_LABELS[preference],
        ]),
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
      throw new Error(i18n.t('streams.thisVideoCdnIsNotSupportedUpdateThe'))
    }
    return {
      kind: 'progressive',
      quality: qualityName(data.quality || 0),
      inputs,
    }
  }
  if (preference !== 'best') {
    throw new Error(
      i18n.t('streams.noStreamMatchesChangeTheQualitySettingAnd', [
        QUALITY_LABELS[preference],
      ]),
    )
  }
  throw new Error(i18n.t('streams.noDownloadableVideoStreamWasReturnedSignIn'))
}
