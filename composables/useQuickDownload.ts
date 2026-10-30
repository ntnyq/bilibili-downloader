import { z } from 'zod'
import { useDownloadSettings } from '~/composables/useDownloadSettings'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { DOWNLOAD_KIND_LABELS } from '~/utils/downloads/labels'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import { parseVideoLocation } from '~/utils/downloads/parseVideoLocation'
import { i18n } from '~/utils/i18n'
import type { MaybeRefOrGetter } from 'vue'

export function useQuickDownload(url: MaybeRefOrGetter<string>) {
  const { settings, isReady, error: settingsError } = useDownloadSettings()
  const isAdding = shallowRef(false)
  const error = shallowRef('')
  const notice = shallowRef('')
  const label = computed(
    () => DOWNLOAD_KIND_LABELS[settings.value.doubleClickKind],
  )
  const hint = computed(() =>
    settings.value.doubleClickKind === 'video'
      ? i18n.t('useQuickDownload.videoHint')
      : i18n.t('useQuickDownload.clickToOpenTheDownloadPanelDoubleClick', [
          label.value,
        ]),
  )
  let revision = 0
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined

  function clearFeedback() {
    clearTimeout(feedbackTimer)
    error.value = ''
    notice.value = ''
  }

  async function download() {
    if (isAdding.value) {
      return
    }
    clearFeedback()
    const target = parseVideoLocation(toValue(url))
    if (!target) {
      error.value = i18n.t(
        'useQuickDownload.cannotIdentifyTheCurrentVideoRefreshThePage',
      )
      return
    }
    if (!isReady.value) {
      error.value =
        settingsError.value
        || i18n.t(
          'useQuickDownload.loadingDownloadSettingsPleaseTryAgainShortly',
        )
      return
    }
    const id = revision
    const kind = settings.value.doubleClickKind
    isAdding.value = true
    try {
      const result = await sendDownloadMessage(
        {
          type: 'queue.add',
          videoId: target.videoId,
          page: target.page,
          mode: 'current',
          quality: 'best',
          kind,
          subtitleLanguage: 'auto',
        },
        z.object({ added: z.number() }),
      )
      if (id === revision) {
        notice.value = result.added
          ? i18n.t('useQuickDownload.addedToTheDownloadQueue', [
              DOWNLOAD_KIND_LABELS[kind],
              settings.value.isPaused
                ? i18n.t('useQuickDownload.downloadStartsWhenTheQueueResumes')
                : '',
            ])
          : i18n.t('useQuickDownload.thisAssetIsAlreadyInTheDownloadQueue')
        feedbackTimer = setTimeout(clearFeedback, 5000)
      }
    } catch (error_) {
      if (id === revision) {
        error.value = getErrorMessage(error_)
      }
    } finally {
      isAdding.value = false
    }
  }

  watch(
    () => toValue(url),
    () => {
      revision++
      clearFeedback()
    },
  )
  onScopeDispose(() => {
    revision++
    clearTimeout(feedbackTimer)
  })

  return {
    isAdding,
    error,
    notice,
    hint,
    download,
    clearFeedback,
  }
}
