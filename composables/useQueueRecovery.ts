import { z } from 'zod'
import { saveFile } from '~/utils/downloads/files/saveFile'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import { i18n } from '~/utils/i18n'

const snapshotSchema = z.object({ json: z.string(), digest: z.string() })

export function useQueueRecovery(recover: (digest?: string) => Promise<void>) {
  const isBusy = shallowRef(false)
  const error = shallowRef('')
  const notice = shallowRef('')
  const controller = new AbortController()

  onScopeDispose(() => controller.abort())

  async function run(operation: () => Promise<void>) {
    if (isBusy.value) {
      return
    }

    isBusy.value = true
    error.value = ''
    notice.value = ''

    try {
      await operation()
    } catch (error_) {
      if (!controller.signal.aborted) {
        error.value = getErrorMessage(error_)
      }
    } finally {
      isBusy.value = false
    }
  }

  function saveSnapshot(json: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')

    return saveFile(
      new Blob([json], { type: 'application/json' }),
      `Bilibili/bilibili-queue-recovery-${timestamp}.json`,
      controller.signal,
      async () => {},
    )
  }

  return {
    isBusy,
    error,
    notice,
    recover: () => run(() => recover()),
    exportAndRecover() {
      return run(async () => {
        const snapshot = await sendDownloadMessage(
          { type: 'queue.recovery.snapshot' },
          snapshotSchema.nullable(),
        )

        if (snapshot) {
          await saveSnapshot(snapshot.json)
        }

        controller.signal.throwIfAborted()
        await recover(snapshot?.digest)
      })
    },
    exportBackups() {
      return run(async () => {
        const json = await sendDownloadMessage(
          { type: 'queue.recovery.backups' },
          z.string().nullable(),
        )

        if (json) {
          await saveSnapshot(json)
        }

        notice.value = json
          ? i18n.t('queueRecovery.backupsExported')
          : i18n.t('queueRecovery.noBackups')
      })
    },
    clearBackups() {
      return run(async () => {
        await sendDownloadMessage({ type: 'queue.recovery.clear' }, z.null())
        notice.value = i18n.t('queueRecovery.backupsCleared')
      })
    },
  }
}
