import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { exportNativeTask } from '~/utils/downloads/native/exportNativeTask'
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
      notice.value = '本地任务已导出，请按上方「下载缓存与大型任务」说明运行。'
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
