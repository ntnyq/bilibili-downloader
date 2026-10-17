import { z } from 'zod'
import { useDownloadSettings } from '~/composables/useDownloadSettings'
import { DOWNLOAD_KIND_LABELS } from '~/utils/downloads/assets'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import { errorMessage, parseVideoLocation } from '~/utils/downloads/model'
import type { MaybeRefOrGetter } from 'vue'

export function useQuickDownload(url: MaybeRefOrGetter<string>) {
  const { settings, isReady, error: settingsError } = useDownloadSettings()
  const isAdding = shallowRef(false)
  const error = shallowRef('')
  const notice = shallowRef('')
  const label = computed(
    () => DOWNLOAD_KIND_LABELS[settings.value.doubleClickKind],
  )
  const hint = computed(
    () =>
      `单击打开下载面板；双击下载${label.value}${settings.value.doubleClickKind === 'video' ? '（最高可用画质）' : ''}`,
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
      error.value = '无法识别当前视频，请刷新页面后重试。'
      return
    }
    if (!isReady.value) {
      error.value = settingsError.value || '正在读取下载设置，请稍后重试。'
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
          ? `${DOWNLOAD_KIND_LABELS[kind]}已加入下载队列${settings.value.isPaused ? '，队列恢复后开始下载' : ''}。`
          : '该资源已在下载队列中。'
        feedbackTimer = setTimeout(clearFeedback, 5000)
      }
    } catch (error_) {
      if (id === revision) {
        error.value = errorMessage(error_)
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
