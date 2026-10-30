import { z } from 'zod'
import { videoInfoSchema } from '~/types/download'
import { bundleAddResultSchema } from '~/types/downloadBundle'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import { parseVideoLocation } from '~/utils/downloads/parseVideoLocation'
import { getBundleTaskCount } from '~/utils/downloads/queue/bundles'
import { selectVideoPages } from '~/utils/downloads/queue/jobs'
import { i18n } from '~/utils/i18n'
import { useDownloadSettings } from './useDownloadSettings'
import type { MaybeRefOrGetter } from 'vue'
import type {
  DownloadKind,
  DownloadMode,
  SubtitleLanguage,
  VideoInfo,
} from '~/types/download'

export function useVideoDownload(url: MaybeRefOrGetter<string>) {
  const video = shallowRef<VideoInfo>()
  const isLoading = shallowRef(false)
  const isAdding = shallowRef(false)
  const error = shallowRef('')
  const notice = shallowRef('')
  const mode = shallowRef<DownloadMode>('current')
  const kind = shallowRef<DownloadKind>('video')
  const isBundleEnabled = shallowRef(false)
  const bundleKinds = shallowRef<DownloadKind[]>(['video', 'cover'])
  const subtitleLanguage = shallowRef<SubtitleLanguage>('auto')
  const selectedPages = shallowRef<number[]>([])
  const preferences = useDownloadSettings()
  const location = computed(() => parseVideoLocation(toValue(url)))
  const currentPage = computed(() =>
    video.value?.pages.find(page => page.page === location.value?.page),
  )
  const hasPageAssets = computed(() =>
    isBundleEnabled.value
      ? bundleKinds.value.some(value => value !== 'cover')
      : kind.value !== 'cover',
  )
  const targetPages = computed(() => {
    if (!video.value || !currentPage.value) {
      return []
    }
    if (!hasPageAssets.value) {
      return video.value.pages.slice(0, 1)
    }
    if (mode.value === 'selected' && !selectedPages.value.length) {
      return []
    }
    return selectVideoPages(
      video.value.pages,
      currentPage.value.page,
      mode.value,
      selectedPages.value,
    )
  })
  const bundleTaskCount = computed(() =>
    getBundleTaskCount(bundleKinds.value, targetPages.value.length),
  )
  let requestId = 0

  async function load() {
    const id = ++requestId
    const target = location.value
    error.value = ''
    notice.value = ''
    video.value = undefined
    mode.value = 'current'
    selectedPages.value = []
    isLoading.value = !!target
    if (!target) {
      return
    }
    try {
      const result = await sendDownloadMessage(
        { type: 'video.get', videoId: target.videoId },
        videoInfoSchema,
      )
      if (requestId !== id) {
        return
      }
      if (!result.pages.some(page => page.page === target.page)) {
        throw new Error(
          i18n.t('useVideoDownload.theCurrentPartDoesNotExistRefreshThe'),
        )
      }
      video.value = result
      selectedPages.value = [target.page]
    } catch (error_) {
      if (requestId === id) {
        error.value = getErrorMessage(error_)
      }
    } finally {
      if (requestId === id) {
        isLoading.value = false
      }
    }
  }

  async function download() {
    if (
      !video.value
      || !currentPage.value
      || isAdding.value
      || !preferences.isReady.value
      || preferences.isSaving.value
    ) {
      return
    }
    const id = requestId
    isAdding.value = true
    error.value = ''
    notice.value = ''
    try {
      if (isBundleEnabled.value) {
        const result = await sendDownloadMessage(
          {
            type: 'queue.bundle.add',
            videoId: video.value.bvid,
            page: currentPage.value.page,
            mode: mode.value,
            selectedPages: selectedPages.value,
            quality: preferences.settings.value.quality,
            kinds: bundleKinds.value,
            subtitleLanguage: subtitleLanguage.value,
          },
          bundleAddResultSchema,
        )
        if (requestId === id) {
          notice.value = result.added
            ? i18n.t(
                'useVideoDownload.addedBundleAssetsOrganizedByVideoFolder',
                result.added,
              )
            : i18n.t('useVideoDownload.allSelectedAssetsAreAlreadyQueued')
          if (result.skipped) {
            notice.value = [
              notice.value,
              i18n.t(
                'useVideoDownload.skippedQueuedAssetsTheyKeepTheirOriginalSave',
                result.skipped,
              ),
            ].join(' ')
          }
        }
        return
      }
      const result = await sendDownloadMessage(
        {
          type: 'queue.add',
          videoId: video.value.bvid,
          page: currentPage.value.page,
          mode: mode.value,
          selectedPages: selectedPages.value,
          quality: preferences.settings.value.quality,
          kind: kind.value,
          subtitleLanguage: subtitleLanguage.value,
        },
        z.object({ added: z.number() }),
      )
      if (requestId === id) {
        notice.value = result.added
          ? i18n.t(
              'useVideoDownload.addedTasksTheDownloadCenterWillProcessThem',
              result.added,
            )
          : i18n.t('useVideoDownload.theSelectedVideosAreAlreadyQueued')
      }
    } catch (error_) {
      if (requestId === id) {
        error.value = getErrorMessage(error_)
      }
    } finally {
      isAdding.value = false
    }
  }

  watch(() => `${location.value?.videoId}:${location.value?.page}`, load, {
    immediate: true,
  })
  onScopeDispose(() => {
    requestId++
  })
  return {
    video,
    currentPage,
    location,
    isLoading,
    isAdding,
    mode,
    kind,
    isBundleEnabled,
    bundleKinds,
    bundleTaskCount,
    hasPageAssets,
    subtitleLanguage,
    selectedPages,
    targetPages,
    preferences,
    error,
    notice,
    load,
    download,
  }
}
