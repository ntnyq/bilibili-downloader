import { exportHistory } from '~/utils/downloads/history'
import { errorMessage } from '~/utils/downloads/model'
import { saveFile } from '~/utils/downloads/saveFile'
import type { DownloadJob } from '~/types/download'

export function useDownloadHistory() {
  const isExporting = shallowRef(false)
  const error = shallowRef('')
  const notice = shallowRef('')
  let controller: AbortController | undefined
  onScopeDispose(() => controller?.abort())
  async function downloadHistory(jobs: DownloadJob[], format: 'json' | 'csv') {
    if (!jobs.length || isExporting.value) {
      return
    }
    isExporting.value = true
    error.value = ''
    notice.value = ''
    controller = new AbortController()
    try {
      const blob = new Blob([exportHistory(jobs, format)], {
        type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
      })
      await saveFile(
        blob,
        `Bilibili/下载记录_${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`,
        controller.signal,
        async () => {},
      )
      notice.value = `已导出 ${jobs.length} 条记录。`
    } catch (error_) {
      error.value = errorMessage(error_)
    } finally {
      isExporting.value = false
    }
  }
  return {
    isExporting,
    error,
    notice,
    downloadHistory,
  }
}
