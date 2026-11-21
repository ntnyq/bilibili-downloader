import {
  episodeAvailabilityListSchema,
  SEASON_EPISODES_PER_PAGE,
  seasonAddResultSchema,
  seasonInfoSchema,
} from '~/types/season'
import { MAX_PENDING_JOBS } from '~/utils/downloads/constants'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import { i18n } from '~/utils/i18n'
import type { MaybeRefOrGetter } from 'vue'
import type { QualityPreference } from '~/types/download'
import type {
  EpisodeAvailability,
  SeasonInfo,
  SeasonTarget,
} from '~/types/season'

export function useSeasonDownload(
  target: SeasonTarget,
  activeEpisodeIds: MaybeRefOrGetter<ReadonlySet<number>>,
) {
  const season = shallowRef<SeasonInfo>()
  const page = shallowRef(1)
  const selected = shallowRef<number[]>([])
  const availability = shallowReactive(new Map<number, EpisodeAvailability>())
  const checking = shallowReactive(new Set<number>())
  const isLoading = shallowRef(false)
  const isAdding = shallowRef(false)
  const error = shallowRef('')
  const notice = shallowRef('')
  let disposed = false

  const pageCount = computed(() =>
    Math.ceil((season.value?.episodes.length ?? 0) / SEASON_EPISODES_PER_PAGE),
  )
  const visibleEpisodes = computed(() => {
    const start = (page.value - 1) * SEASON_EPISODES_PER_PAGE

    return (
      season.value?.episodes.slice(start, start + SEASON_EPISODES_PER_PAGE)
      ?? []
    )
  })
  const rows = computed(() =>
    visibleEpisodes.value.map(episode => {
      const checked = availability.get(episode.epId)
      const reason = episode.unavailableReason ?? checked?.unavailableReason
      const isActive = toValue(activeEpisodeIds).has(episode.epId)
      const isChecking = checking.has(episode.epId)

      return {
        epId: episode.epId,
        label: [episode.episodeLabel, episode.episodeTitle]
          .filter(Boolean)
          .join(' · '),
        isSelectable:
          !isActive
          && !isChecking
          && !!checked
          && !reason
          && (!checked.retryReason || selected.value.includes(episode.epId)),
        status: isActive
          ? i18n.t('season.alreadyQueued')
          : (reason
            ?? (checked?.retryReason && !isChecking
              ? i18n.t('season.unverifiedEpisode', [checked.retryReason])
              : undefined)
            ?? (checked && !isChecking
              ? i18n.t('season.available')
              : i18n.t('season.checking'))),
      }
    }),
  )
  const selectedEpisodeIds = computed(() =>
    selected.value.filter(
      epId =>
        !toValue(activeEpisodeIds).has(epId)
        && !checking.has(epId)
        && !availability.get(epId)?.unavailableReason,
    ),
  )
  const canRecheck = computed(
    () =>
      !isAdding.value
      && !visibleEpisodes.value.some(({ epId }) => checking.has(epId))
      && visibleEpisodes.value.some(
        ({ epId }) =>
          availability.get(epId)?.unavailableReason
          || availability.get(epId)?.retryReason,
      ),
  )

  async function load() {
    isLoading.value = true
    error.value = ''

    try {
      season.value = await sendDownloadMessage(
        { type: 'season.get', target },
        seasonInfoSchema,
      )
    } catch (error_) {
      error.value = getErrorMessage(error_)
    } finally {
      isLoading.value = false
    }
  }

  async function checkVisibleEpisodes(recheck = false) {
    const episodes = visibleEpisodes.value.flatMap(
      ({ epId, cid, unavailableReason }) => {
        if (cid === undefined || unavailableReason || checking.has(epId)) {
          return []
        }

        const checked = availability.get(epId)

        return (
          recheck
            ? !checked?.unavailableReason && !checked?.retryReason
            : checked
        )
          ? []
          : [{ epId, cid }]
      },
    )

    if (!episodes.length) {
      return
    }

    for (const { epId } of episodes) {
      checking.add(epId)
    }

    const results = await sendDownloadMessage(
      { type: 'season.availability', episodes },
      episodeAvailabilityListSchema,
    ).catch(error => {
      const retryReason = getErrorMessage(error)

      return episodes.map(({ epId }) => ({
        epId,
        retryReason,
      }))
    })

    for (const result of results) {
      availability.set(result.epId, result)
    }

    for (const { epId } of episodes) {
      checking.delete(epId)
    }

    selected.value = selected.value.filter(
      epId => !availability.get(epId)?.unavailableReason,
    )
  }

  async function addSelected(quality: QualityPreference) {
    const epIds = selectedEpisodeIds.value

    if (!season.value || !epIds.length || isAdding.value) {
      return
    }

    if (epIds.length > MAX_PENDING_JOBS) {
      error.value = i18n.t('jobs.theDownloadQueueIsFullWaitForSome')

      return
    }

    isAdding.value = true
    error.value = ''
    notice.value = ''

    try {
      const result = await sendDownloadMessage(
        {
          type: 'queue.season.add',
          seasonId: season.value.seasonId,
          epIds,
          quality,
        },
        seasonAddResultSchema,
      )

      if (disposed) {
        return
      }

      for (const episode of [...result.unavailable, ...result.unverified]) {
        availability.set(episode.epId, episode)
      }

      const retryIds = new Set(result.unverified.map(episode => episode.epId))

      selected.value = selected.value.filter(epId => retryIds.has(epId))
      notice.value = [
        result.added ? i18n.t('season.added', result.added) : '',
        result.skipped ? i18n.t('season.skipped', result.skipped) : '',
        result.unavailable.length
          ? i18n.t('season.unavailableCount', result.unavailable.length)
          : '',
        result.unverified.length
          ? i18n.t('season.unverifiedCount', result.unverified.length)
          : '',
      ]
        .filter(Boolean)
        .join(' ')
    } catch (error_) {
      error.value = getErrorMessage(error_)
    } finally {
      isAdding.value = false
    }
  }

  watch(visibleEpisodes, () => {
    return checkVisibleEpisodes()
  })
  watch(
    () => toValue(activeEpisodeIds),
    ids => {
      selected.value = selected.value.filter(epId => !ids.has(epId))
    },
  )
  onScopeDispose(() => {
    disposed = true
  })
  load()

  return {
    season,
    page,
    pageCount,
    rows,
    selected,
    selectedEpisodeIds,
    isLoading,
    isAdding,
    canRecheck,
    error,
    notice,
    load,
    checkVisibleEpisodes,
    addSelected,
  }
}
