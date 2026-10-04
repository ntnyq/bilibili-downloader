import { z } from 'zod'
import { browser } from '#imports'
import {
  DOWNLOAD_LIBRARY_STORAGE_KEY,
  downloadLibrarySchema,
} from '~/types/downloadHistory'
import {
  clearDownloadLibrary,
  filterLibraryRecords,
} from '~/utils/downloads/library'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import { errorMessage } from '~/utils/downloads/model'
import type { Browser } from '#imports'
import type { DownloadKind } from '~/types/download'
import type { requestSchema } from '~/utils/downloads/messages'

const PAGE_SIZE = 20

export function useDownloadLibrary() {
  const library = shallowRef(clearDownloadLibrary())
  const error = shallowRef('')
  const notice = shallowRef('')
  const isReady = shallowRef(false)
  const isBusy = shallowRef(false)
  const isRefreshing = shallowRef(false)
  const search = shallowRef('')
  const kind = shallowRef<DownloadKind | 'all'>('all')
  const requestedPage = shallowRef(1)
  const records = computed(() => library.value.records)
  const evictedCount = computed(() => library.value.evictedCount)
  const filteredRecords = computed(() =>
    filterLibraryRecords(records.value, search.value, kind.value),
  )
  const pageCount = computed(() =>
    Math.max(1, Math.ceil(filteredRecords.value.length / PAGE_SIZE)),
  )
  const page = computed(() => Math.min(requestedPage.value, pageCount.value))
  const visibleRecords = computed(() =>
    filteredRecords.value.slice(
      (page.value - 1) * PAGE_SIZE,
      page.value * PAGE_SIZE,
    ),
  )
  let revision = 0
  let isDisposed = false

  const onChanged = (
    changes: Record<string, Browser.storage.StorageChange>,
    area: string,
  ) => {
    const change = changes[DOWNLOAD_LIBRARY_STORAGE_KEY]
    if (area !== 'local' || !change || isDisposed) {
      return
    }
    revision++
    const result = downloadLibrarySchema.safeParse(change.newValue)
    if (result.success) {
      library.value = result.data
      isReady.value = true
    } else {
      error.value = '下载历史读取失败，请刷新重试。'
    }
  }

  async function refresh() {
    if (isRefreshing.value || isDisposed) {
      return
    }
    isRefreshing.value = true
    error.value = ''
    const currentRevision = revision
    try {
      const result = await sendDownloadMessage(
        { type: 'library.list' },
        downloadLibrarySchema,
      )
      if (!isDisposed && revision === currentRevision) {
        library.value = result
        isReady.value = true
      }
    } catch (error_) {
      if (!isDisposed && revision === currentRevision) {
        error.value = errorMessage(error_)
      }
    } finally {
      isRefreshing.value = false
    }
  }

  async function act(message: z.infer<typeof requestSchema>, success: string) {
    if (isBusy.value || isDisposed) {
      return
    }
    isBusy.value = true
    error.value = ''
    notice.value = ''
    try {
      await sendDownloadMessage(message, z.null())
      if (!isDisposed) {
        notice.value = success
      }
    } catch (error_) {
      if (!isDisposed) {
        error.value = errorMessage(error_)
      }
    } finally {
      isBusy.value = false
    }
  }

  watch([search, kind], () => {
    requestedPage.value = 1
  })
  browser.storage.onChanged.addListener(onChanged)
  refresh()
  onScopeDispose(() => {
    isDisposed = true
    browser.storage.onChanged.removeListener(onChanged)
  })

  return {
    records,
    filteredRecords,
    visibleRecords,
    evictedCount,
    page,
    pageCount,
    search,
    kind,
    isReady: readonly(isReady),
    isBusy: readonly(isBusy),
    isRefreshing: readonly(isRefreshing),
    error: readonly(error),
    notice: readonly(notice),
    refresh,
    previousPage() {
      requestedPage.value = Math.max(1, page.value - 1)
    },
    nextPage() {
      requestedPage.value = Math.min(pageCount.value, page.value + 1)
    },
    requeue(identity: string) {
      return act(
        { type: 'library.requeue', identity },
        '已按原任务设置重新加入队列。',
      )
    },
    remove(identity: string) {
      return act({ type: 'library.delete', identity }, '已删除这条下载历史。')
    },
    clear() {
      return act(
        { type: 'library.clear' },
        '下载历史已清空，批量导入将不再跳过这些素材。',
      )
    },
  }
}
