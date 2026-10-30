import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import {
  clearMediaCache,
  getMediaCacheStats,
} from '~/utils/downloads/media/mediaCache'
import { getAvailableMediaStorageBytes } from '~/utils/downloads/media/storageBudget'
import { i18n } from '~/utils/i18n'

export function useDownloadCache() {
  const stats = shallowRef<Awaited<ReturnType<typeof getMediaCacheStats>>>()
  const availableBytes = shallowRef<number | null>(null)
  const isRefreshing = shallowRef(false)
  const isClearing = shallowRef(false)
  const refreshError = shallowRef('')
  const actionError = shallowRef('')
  const notice = shallowRef('')
  let interval: ReturnType<typeof setInterval> | undefined
  let revision = 0
  let isDisposed = false

  async function refresh() {
    if (isRefreshing.value || isClearing.value || isDisposed) {
      return
    }
    isRefreshing.value = true
    const currentRevision = revision
    try {
      const [value, available] = await Promise.all([
        getMediaCacheStats(),
        getAvailableMediaStorageBytes(),
      ])
      if (!isDisposed && revision === currentRevision) {
        stats.value = value
        availableBytes.value = available
        refreshError.value = ''
      }
    } catch (error) {
      if (!isDisposed && revision === currentRevision) {
        refreshError.value = getErrorMessage(error)
      }
    } finally {
      isRefreshing.value = false
    }
  }

  async function clear() {
    if (isClearing.value || isDisposed) {
      return
    }
    isClearing.value = true
    actionError.value = ''
    notice.value = ''
    try {
      if (!navigator.locks) {
        throw new Error(
          i18n.t('useDownloadCache.thisBrowserCannotSafelyClearTheCacheUpdate'),
        )
      }
      await navigator.locks.request(
        'bilibili-media-cache',
        { ifAvailable: true },
        async lock => {
          if (!lock) {
            throw new Error(
              i18n.t('useDownloadCache.downloadsAreUsingTheCachePauseTheQueue'),
            )
          }
          await clearMediaCache()
        },
      )
      revision++
      stats.value = { bytes: 0, entries: 0 }
      refreshError.value = ''
      notice.value = i18n.t(
        'useDownloadCache.downloadCacheClearedTheNextRetryWillDownload',
      )
    } catch (error) {
      actionError.value = getErrorMessage(error)
    } finally {
      isClearing.value = false
    }
  }

  onMounted(() => {
    refresh()
    interval = setInterval(refresh, 5000)
  })
  onScopeDispose(() => {
    isDisposed = true
    clearInterval(interval)
  })

  return {
    stats: readonly(stats),
    availableBytes: readonly(availableBytes),
    isRefreshing: readonly(isRefreshing),
    isClearing: readonly(isClearing),
    error: computed(() => actionError.value || refreshError.value),
    notice: readonly(notice),
    refresh,
    clear,
  }
}
