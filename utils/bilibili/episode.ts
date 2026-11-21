import { z } from 'zod'
import { episodeIdSchema, videoIdSchema } from '~/types/download'
import { QUALITY_REQUEST_IDS } from '~/utils/downloads/media/quality'
import { i18n } from '~/utils/i18n'
import { getVideoMedia, requestApiResult } from './api'
import { normalizeMediaUrl, playDataSchema, selectMedia } from './streams'
import type {
  DownloadJob,
  EpisodeInfo,
  QualityPreference,
} from '~/types/download'

const episodeIdFields = z.object({
  id: episodeIdSchema.optional(),
  ep_id: episodeIdSchema.optional(),
})
const episodeSchema = z.object({
  badge: z.string().optional(),
  bvid: videoIdSchema,
  cid: z.number().int().positive(),
  duration: z.number().nonnegative(),
  title: z.string(),
  long_title: z.string().optional(),
})
const seasonSchema = z.object({
  title: z.string(),
  cover: z.string(),
  up_info: z.object({ uname: z.string().optional() }).nullish(),
  episodes: z.array(z.unknown()).nullish(),
  section: z
    .array(z.object({ episodes: z.array(z.unknown()).default([]) }))
    .nullish(),
})
const episodePlaybackSchema = z.object({
  play_check: z.object({ play_detail: z.string() }).nullish(),
  view_info: z
    .object({
      dialog: z
        .object({
          title: z.object({ text: z.string().optional() }).nullish(),
        })
        .nullish(),
    })
    .nullish(),
  video_info: z.unknown().optional(),
})

export async function getEpisodeInfo(epId: number): Promise<EpisodeInfo> {
  const season = seasonSchema.parse(
    await requestApiResult(`/pgc/view/web/season?ep_id=${epId}`),
  )
  const entries = [season, ...(season.section ?? [])].flatMap(
    group => group.episodes ?? [],
  )
  const entry = entries.find(item => {
    const { data } = episodeIdFields.safeParse(item)

    return (data?.ep_id ?? data?.id) === epId
  })

  if (!entry) {
    throw new Error(i18n.t('episode.episodeNotFound'))
  }

  const episode = episodeSchema.parse(entry)
  const label = episode.title.trim()
  const episodeLabel = /^\d+(?:\.\d+)?$/.test(label)
    ? i18n.t('episode.number', [label])
    : label
  const longTitle = episode.long_title?.trim() || ''
  const episodeTitle = longTitle === label ? '' : longTitle

  return {
    epId,
    bvid: episode.bvid,
    title: season.title,
    cover: normalizeMediaUrl(season.cover) || '',
    owner: season.up_info?.uname || '',
    episodeLabel,
    episodeTitle,
    unavailableReason:
      episode.badge === '预告' ? i18n.t('episode.trailerOnly') : undefined,
    pages: [
      {
        cid: episode.cid,
        page: entries.indexOf(entry) + 1,
        part: [episodeLabel, episodeTitle].filter(Boolean).join(' · '),
        duration: episode.duration / 1000,
      },
    ],
  }
}

/**
 * Accept only whole, unprotected playback from the current Bilibili session.
 */
async function getEpisodeMedia(
  epId: number,
  cid: number,
  signal: AbortSignal,
  preference: QualityPreference,
) {
  const query = new URLSearchParams({
    ep_id: String(epId),
    cid: String(cid),
    qn: String(QUALITY_REQUEST_IDS[preference]),
    fnval: '4048',
    fnver: '0',
    fourk: '1',
  })
  const result = episodePlaybackSchema.parse(
    await requestApiResult(`/pgc/player/web/v2/playurl?${query}`, signal),
  )
  const playDetail = result.play_check?.play_detail
  const data =
    result.video_info == null
      ? undefined
      : playDataSchema.parse(result.video_info)

  if (data?.is_drm) {
    throw new Error(i18n.t('episode.drmProtected'))
  }

  if (data?.is_preview || playDetail === 'PLAY_PREVIEW') {
    throw new Error(i18n.t('episode.previewOnly'))
  }

  if (playDetail === 'AREA_LIMIT') {
    throw new Error(i18n.t('episode.regionRestricted'))
  }

  if (playDetail !== 'PLAY_WHOLE' || !data) {
    throw new Error(
      result.view_info?.dialog?.title?.text
        || i18n.t('episode.fullPlaybackUnavailable'),
    )
  }

  return selectMedia(data, preference)
}

export function getDownloadMedia(
  target: Pick<DownloadJob, 'bvid' | 'cid' | 'epId'>,
  signal: AbortSignal,
  preference: QualityPreference,
  kind: 'video' | 'audio' = 'video',
) {
  return target.epId === undefined
    ? getVideoMedia(target.bvid, target.cid, signal, preference, kind)
    : getEpisodeMedia(target.epId, target.cid, signal, preference)
}
