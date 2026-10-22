import {
  clearMediaCache,
  getMediaCacheStats,
} from '~/utils/downloads/mediaCache'
import { errorMessage } from '~/utils/downloads/model'
import { getAvailableMediaStorageBytes } from '~/utils/downloads/storageBudget'

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
        refreshError.value = errorMessage(error)
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
        throw new Error('当前浏览器无法安全清理缓存，请更新浏览器后重试。')
      }
      await navigator.locks.request(
        'bilibili-media-cache',
        { ifAvailable: true },
        async lock => {
          if (!lock) {
            throw new Error(
              '下载正在使用缓存，请暂停队列并等待当前任务结束后再清理。',
            )
          }
          await clearMediaCache()
        },
      )
      revision++
      stats.value = { bytes: 0, entries: 0 }
      refreshError.value = ''
      notice.value = '下载缓存已清理，下次重试将重新下载媒体。'
    } catch (error) {
      actionError.value = errorMessage(error)
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
