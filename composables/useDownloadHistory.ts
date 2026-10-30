import { saveFile } from '~/utils/downloads/files/saveFile'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { serializeDownloadHistory } from '~/utils/downloads/history/serializeDownloadHistory'
import { i18n } from '~/utils/i18n'
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
      const blob = new Blob([serializeDownloadHistory(jobs, format)], {
        type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
      })
      await saveFile(
        blob,
        i18n.t('useDownloadHistory.bilibiliDownloadHistory', [
          new Date().toISOString().replace(/[:.]/g, '-'),
          format,
        ]),
        controller.signal,
        async () => {},
      )
      notice.value = i18n.t('useDownloadHistory.exportedRecords', jobs.length)
    } catch (error_) {
      error.value = getErrorMessage(error_)
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
