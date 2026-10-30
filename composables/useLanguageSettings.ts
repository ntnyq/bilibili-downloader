import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import {
  initializeI18n,
  languagePreference,
  parseLanguagePreference,
  setLanguagePreference,
} from '~/utils/i18n'

export function useLanguageSettings() {
  const isReady = shallowRef(false)
  const isSaving = shallowRef(false)
  const error = shallowRef('')

  initializeI18n()
    .then(() => {
      isReady.value = true
    })
    .catch(error_ => {
      error.value = getErrorMessage(error_)
    })

  async function updateLanguage(value: unknown) {
    if (!isReady.value || isSaving.value) {
      return
    }
    isSaving.value = true
    error.value = ''
    try {
      await setLanguagePreference(parseLanguagePreference(value))
    } catch (error_) {
      error.value = getErrorMessage(error_)
    } finally {
      isSaving.value = false
    }
  }

  return {
    languagePreference,
    isReady,
    isSaving,
    error,
    updateLanguage,
  }
}
