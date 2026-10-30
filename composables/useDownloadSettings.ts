import { browser } from '#imports'
import { downloadSettingsSchema } from '~/types/download'
import { SETTINGS_STORAGE_KEY } from '~/utils/downloads/constants'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import type { Browser } from '#imports'
import type { DownloadSettings } from '~/types/download'

export function useDownloadSettings() {
  const settings = shallowRef(downloadSettingsSchema.parse({}))
  const isReady = shallowRef(false)
  const isSaving = shallowRef(false)
  const error = shallowRef('')
  let revision = 0
  let disposed = false

  const onChanged = (
    changes: Record<string, Browser.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'local' || !changes[SETTINGS_STORAGE_KEY]) {
      return
    }
    const result = downloadSettingsSchema.safeParse(
      changes[SETTINGS_STORAGE_KEY].newValue || {},
    )
    if (result.success) {
      revision++
      settings.value = result.data
      isReady.value = true
    }
  }
  browser.storage.onChanged.addListener(onChanged)
  const initialRevision = revision
  sendDownloadMessage({ type: 'settings.get' }, downloadSettingsSchema)
    .then(value => {
      if (!disposed && initialRevision === revision) {
        settings.value = value
        isReady.value = true
      }
    })
    .catch(error_ => {
      error.value = getErrorMessage(error_)
    })
  onScopeDispose(() => {
    disposed = true
    browser.storage.onChanged.removeListener(onChanged)
  })

  async function updateSettings(patch: Partial<DownloadSettings>) {
    if (isSaving.value || !isReady.value) {
      return false
    }
    isSaving.value = true
    error.value = ''
    const beforeUpdate = revision
    try {
      const value = await sendDownloadMessage(
        { type: 'settings.update', settings: patch },
        downloadSettingsSchema,
      )
      if (!disposed && beforeUpdate === revision) {
        settings.value = value
      }
      return true
    } catch (error_) {
      error.value = getErrorMessage(error_)
      return false
    } finally {
      isSaving.value = false
    }
  }

  return {
    settings,
    isReady,
    isSaving,
    error,
    updateSettings,
  }
}
