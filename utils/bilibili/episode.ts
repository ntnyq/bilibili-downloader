import { z } from 'zod'
import { episodeIdSchema, videoIdSchema } from '~/types/download'
import { seasonIdSchema } from '~/types/season'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { QUALITY_REQUEST_IDS } from '~/utils/downloads/media/quality'
import { i18n } from '~/utils/i18n'
import { BilibiliApiError, getVideoMedia, requestApiResult } from './api'
import { normalizeMediaUrl, playDataSchema, selectMedia } from './streams'
import type {
  DownloadJob,
  EpisodeInfo,
  QualityPreference,
} from '~/types/download'
import type {
  EpisodeAvailability,
  EpisodePlaybackTarget,
  SeasonEpisode,
  SeasonTarget,
} from '~/types/season'

const episodeIdFields = z.object({
  id: episodeIdSchema.optional(),
  ep_id: episodeIdSchema.optional(),
})
const episodeTitleFields = z.object({
  title: z.string(),
  long_title: z.string().optional(),
})
const episodeSchema = episodeTitleFields.extend({
  badge: z.string().optional(),
  bvid: videoIdSchema,
  cid: z.number().int().positive(),
  duration: z.number().nonnegative(),
})
const seasonSchema = z.object({
  season_id: seasonIdSchema.optional(),
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
  const { season, entries } = await loadSeason({ epId })
  const index = entries.findIndex(item => readEpisodeId(item) === epId)

  if (index === -1) {
    throw new Error(i18n.t('episode.episodeNotFound'))
  }

  return toEpisodeInfo(
    season,
    episodeSchema.parse(entries[index]),
    epId,
    index + 1,
  )
}

export async function getSeasonInfo(target: SeasonTarget) {
  const { season, entries } = await loadSeason(target)
  const seen = new Set<number>()
  const episodes = entries.flatMap<SeasonEpisode & { info?: EpisodeInfo }>(
    (entry, index) => {
      const epId = readEpisodeId(entry)

      if (epId === undefined || seen.has(epId)) {
        return []
      }

      seen.add(epId)
      const parsed = episodeSchema.safeParse(entry)

      if (parsed.success) {
        const info = toEpisodeInfo(season, parsed.data, epId, index + 1)

        return [
          {
            epId,
            episodeLabel: info.episodeLabel,
            episodeTitle: info.episodeTitle,
            cid: info.pages[0].cid,
            unavailableReason: info.unavailableReason,
            info,
          },
        ]
      }

      return [
        {
          epId,
          ...getEpisodeTitle(
            episodeTitleFields.safeParse(entry).data,
            index + 1,
          ),
          unavailableReason: i18n.t('episode.missingPlaybackInformation'),
        },
      ]
    },
  )

  return {
    seasonId: seasonIdSchema.parse(season.season_id),
    title: season.title,
    cover: normalizeMediaUrl(season.cover) || '',
    episodes,
  }
}

async function loadSeason(target: SeasonTarget) {
  const query =
    'seasonId' in target
      ? `season_id=${target.seasonId}`
      : `ep_id=${target.epId}`
  const season = seasonSchema.parse(
    await requestApiResult(`/pgc/view/web/season?${query}`),
  )
  const entries = [season, ...(season.section ?? [])].flatMap(
    group => group.episodes ?? [],
  )

  return {
    season,
    entries,
  }
}

function readEpisodeId(entry: unknown) {
  const { data } = episodeIdFields.safeParse(entry)

  return data?.ep_id ?? data?.id
}

function getEpisodeTitle(
  episode: z.infer<typeof episodeTitleFields> | undefined,
  page: number,
) {
  const label = episode?.title.trim() || String(page)
  const episodeLabel = /^\d+(?:\.\d+)?$/.test(label)
    ? i18n.t('episode.number', [label])
    : label
  const longTitle = episode?.long_title?.trim() || ''
  const episodeTitle = longTitle === label ? '' : longTitle

  return {
    episodeLabel,
    episodeTitle,
  }
}

function toEpisodeInfo(
  season: z.infer<typeof seasonSchema>,
  episode: z.infer<typeof episodeSchema>,
  epId: number,
  page: number,
): EpisodeInfo {
  const { episodeLabel, episodeTitle } = getEpisodeTitle(episode, page)

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
        page,
        part: [episodeLabel, episodeTitle].filter(Boolean).join(' · '),
        duration: episode.duration / 1000,
      },
    ],
  }
}

export async function checkEpisodeAvailability(
  episodes: EpisodePlaybackTarget[],
  quality: QualityPreference,
): Promise<EpisodeAvailability[]> {
  const signal = AbortSignal.timeout(25_000)
  const results: EpisodeAvailability[] = []
  const concurrency = 4

  for (let index = 0; index < episodes.length; index += concurrency) {
    const batch = episodes.slice(index, index + concurrency)

    results.push(
      ...(await Promise.all(
        batch.map(async ({ epId, cid }) => {
          try {
            signal.throwIfAborted()
            await getEpisodeMedia(epId, cid, signal, quality)

            return {
              epId,
            }
          } catch (error) {
            const detail =
              error instanceof BilibiliApiError && error.cause
                ? error.cause
                : error

            if (
              signal.aborted
              || detail instanceof TypeError
              || (detail instanceof DOMException
                && detail.name === 'TimeoutError')
              || (error instanceof BilibiliApiError
                && ([-352, -412, -401, 429].includes(error.code)
                  || (error.code >= 500 && error.code < 600)))
            ) {
              return {
                epId,
                retryReason: getErrorMessage(error),
              }
            }

            return {
              epId,
              unavailableReason: getErrorMessage(error),
            }
          }
        }),
      )),
    )
  }

  return results
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
