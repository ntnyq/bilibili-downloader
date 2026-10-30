import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { exportNativeTask } from '~/utils/downloads/native/exportNativeTask'
import { i18n } from '~/utils/i18n'
import type { DownloadJob } from '~/types/download'

export function useNativeDownload() {
  const isExporting = shallowRef(false)
  const error = shallowRef('')
  const notice = shallowRef('')
  let controller: AbortController | undefined
  onScopeDispose(() => controller?.abort())

  async function downloadNativeTask(job: DownloadJob) {
    if (isExporting.value) {
      return
    }
    isExporting.value = true
    error.value = ''
    notice.value = ''
    controller = new AbortController()
    try {
      await exportNativeTask(job, controller.signal)
      notice.value = i18n.t(
        'useNativeDownload.localTaskExportedFollowTheLocalHelperInstructions',
      )
    } catch (error_) {
      error.value = getErrorMessage(error_)
    } finally {
      isExporting.value = false
    }
  }

  return {
    isExporting: readonly(isExporting),
    error: readonly(error),
    notice: readonly(notice),
    downloadNativeTask,
  }
}
