import { z } from 'zod'
import { videoPageSchema } from '../../types/download'
import { QUALITY_REQUEST_IDS } from '../downloads/media/quality'
import {
  normalizeMediaUrl,
  playDataSchema,
  selectAudio,
  selectMedia,
} from './streams'
import { selectSubtitle, subtitleInfoSchema } from './subtitles'
import { createMixinKey, signWbi } from './wbi'
import type {
  QualityPreference,
  SubtitleLanguage,
  VideoInfo,
} from '../../types/download'

const responseSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z.unknown().optional(),
})
const viewSchema = z.object({
  bvid: z.string(),
  title: z.string(),
  pic: z.string(),
  owner: z.object({ name: z.string() }),
  pages: z.array(videoPageSchema).min(1),
  rights: z.object({ is_stein_gate: z.number().optional() }).optional(),
})
const navSchema = z.object({
  wbi_img: z.object({ img_url: z.string(), sub_url: z.string() }),
})
let cachedKey: { value: string; expires: number } | undefined

/**
 * Keeps server rejection codes available to batch imports without retrying them.
 */
export class BilibiliApiError extends Error {
  readonly code: number
  readonly shouldStopBatch: boolean

  constructor(
    message: string,
    options: ErrorOptions & { code: number; shouldStopBatch: boolean },
  ) {
    super(message, options)
    this.name = 'BilibiliApiError'
    this.code = options.code
    this.shouldStopBatch = options.shouldStopBatch
  }
}

/**
 * Requests and validates a Bilibili API envelope using the current browser
 * session.
 *
 * @param path - API path and query appended to https://api.bilibili.com.
 * @param signal - Optional caller cancellation signal; each request also has a
 * 15-second timeout.
 * @param allowGuest - Whether to accept the guest code -101; defaults to
 * false.
 * @returns A promise resolving to the unvalidated data field, possibly
 * undefined for an accepted guest response.
 * @throws {BilibiliApiError} If HTTP status, server rejection, or JSON
 *   decoding prevents a usable response.
 * @throws {import('zod').ZodError} If the response envelope does not match the
 *   API schema.
 * @throws The fetch error or abort reason if the request fails, times out, or
 *   is cancelled.
 */
export async function requestApi(
  path: string,
  signal?: AbortSignal,
  allowGuest = false,
): Promise<unknown> {
  const response = await fetch(`https://api.bilibili.com${path}`, {
    credentials: 'include',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    throw new BilibiliApiError(
      `B 站接口请求失败（HTTP ${response.status}），请稍后重试。`,
      { code: response.status, shouldStopBatch: response.status !== 404 },
    )
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new BilibiliApiError('B 站返回的内容无法解析，请稍后重试。', {
      code: response.status,
      shouldStopBatch: true,
      cause: error,
    })
  }
  const result = responseSchema.parse(payload)
  if (result.code !== 0 && (!allowGuest || result.code !== -101)) {
    if ([-352, -412, -401].includes(result.code)) {
      throw new BilibiliApiError(
        'B 站暂时限制了请求，请在网页正常播放视频后稍后重试。',
        { code: result.code, shouldStopBatch: true },
      )
    }
    throw new BilibiliApiError(
      `B 站：${result.message || '请求失败'}（${result.code}）${result.code === -101 ? '，请先在 B 站网页登录。' : ''}`,
      {
        code: result.code,
        shouldStopBatch: ![-404, 62002, 62004].includes(result.code),
      },
    )
  }
  return result.data
}

/**
 * Loads canonical video metadata and rejects unsupported interactive videos.
 *
 * @param videoId - BV identifier or av identifier used to query video
 * metadata.
 * @param signal - Optional cancellation signal for the metadata request.
 * @returns A promise resolving to the canonical BV identifier, title, owner,
 * safe cover URL, and ordered parts.
 * @throws {Error} If the video is interactive.
 * @throws {import('zod').ZodError} If returned metadata is malformed.
 * @throws The API request error or abort reason if metadata cannot be loaded.
 */
export async function getVideoInfo(
  videoId: string,
  signal?: AbortSignal,
): Promise<VideoInfo> {
  const param = videoId.startsWith('av')
    ? `aid=${videoId.slice(2)}`
    : `bvid=${videoId}`
  const data = viewSchema.parse(
    await requestApi(`/x/web-interface/view?${param}`, signal),
  )
  if (data.rights?.is_stein_gate) {
    throw new Error('暂不支持互动视频，请选择普通单视频或多 P 视频。')
  }
  return {
    bvid: data.bvid,
    title: data.title,
    cover: normalizeMediaUrl(data.pic) || '',
    owner: data.owner.name,
    pages: data.pages,
  }
}

/**
 * Loads the WBI mixin key, reusing a successful key for 30 seconds.
 *
 * @param signal - Optional cancellation signal, used only when a network
 * request is needed.
 * @returns A promise resolving to the 32-character WBI signing key.
 * @throws {import('zod').ZodError} If navigation data lacks the signing image
 *   URLs.
 * @throws {Error} If signing URLs or key material are invalid.
 * @throws The API request error or abort reason if refreshing the key fails.
 */
export async function getWbiKey(signal?: AbortSignal): Promise<string> {
  if (cachedKey && cachedKey.expires > Date.now()) {
    return cachedKey.value
  }
  const data = navSchema.parse(
    await requestApi('/x/web-interface/nav', signal, true),
  )
  const value = createMixinKey(data.wbi_img.img_url, data.wbi_img.sub_url)
  cachedKey = { value, expires: Date.now() + 30000 }
  return value
}

/**
 * Loads signed playback data and selects downloadable tracks for one video
 * part.
 *
 * @param bvid - Canonical BV identifier of the video.
 * @param cid - Content identifier of the requested part.
 * @param signal - Cancellation signal shared by signing and playback requests.
 * @param preference - Requested quality cap; defaults to best.
 * @param kind - Video with audio or AAC audio alone; defaults to video.
 * @returns A promise resolving to selected DASH, progressive, or audio inputs
 * and their quality label.
 * @throws {import('zod').ZodError} If playback data is malformed.
 * @throws {Error} If only preview/DRM content is returned or no supported
 *   tracks satisfy the selection.
 * @throws The signing or API request error, including cancellation, if
 *   playback data cannot be loaded.
 */
export async function getVideoMedia(
  bvid: string,
  cid: number,
  signal: AbortSignal,
  preference: QualityPreference = 'best',
  kind: 'video' | 'audio' = 'video',
) {
  const key = await getWbiKey(signal)
  const query = signWbi(
    {
      bvid,
      cid,
      qn: QUALITY_REQUEST_IDS[preference],
      fnval: 4048,
      fnver: 0,
      fourk: 1,
    },
    key,
  )
  const data = playDataSchema.parse(
    await requestApi(`/x/player/wbi/playurl?${query}`, signal),
  )
  return kind === 'audio' ? selectAudio(data) : selectMedia(data, preference)
}

/**
 * Loads signed subtitle metadata and selects a supported subtitle for one
 * part.
 *
 * @param bvid - Canonical BV identifier of the video.
 * @param cid - Content identifier of the requested part.
 * @param language - Preferred subtitle language, or auto for Chinese-first
 * selection.
 * @param signal - Cancellation signal shared by signing and subtitle requests.
 * @returns A promise resolving to a trusted subtitle URL and its display
 * label.
 * @throws {import('zod').ZodError} If subtitle metadata is malformed.
 * @throws {Error} If subtitles require login, no matching language exists, or
 *   the selected URL is unsupported.
 * @throws The signing or API request error, including cancellation, if
 *   metadata cannot be loaded.
 */
export async function getSubtitle(
  bvid: string,
  cid: number,
  language: SubtitleLanguage,
  signal: AbortSignal,
) {
  const query = signWbi({ bvid, cid }, await getWbiKey(signal))
  const data = subtitleInfoSchema.parse(
    await requestApi(`/x/player/wbi/v2?${query}`, signal),
  )
  return selectSubtitle(data, language)
}
