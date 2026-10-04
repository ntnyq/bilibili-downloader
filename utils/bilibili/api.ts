import { z } from 'zod'
import { videoPageSchema } from '../../types/download'
import { QUALITY_REQUEST_IDS } from '../downloads/quality'
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
