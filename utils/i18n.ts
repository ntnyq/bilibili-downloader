import { readonly, shallowRef, watchEffect } from 'vue'
import { browser } from 'wxt/browser'
import { i18n as extensionI18n } from '#i18n'
import { catalogs } from '#i18n-catalogs'
import { formatI18nMessage } from './formatI18nMessage'

export type LanguagePreference = 'browser' | 'zh-CN' | 'en'

export const LANGUAGE_STORAGE_KEY = 'languagePreference'
const selectedLanguage = shallowRef<LanguagePreference>('browser')
export const languagePreference = readonly(selectedLanguage)
let initialization: Promise<void> | undefined
let revision = 0

export const i18n = {
  t: new Proxy(extensionI18n.t, {
    apply(target, thisArgument, args: unknown[]) {
      const preference = selectedLanguage.value
      const [key, ...parameters] = args
      if (String(key).startsWith('@@')) {
        return Reflect.apply(target, thisArgument, args)
      }
      const messageKey = String(key).replaceAll('.', '_')
      const language =
        preference === 'browser' ? extensionI18n.t('localeCode') : preference
      const locale = language === 'zh-CN' ? 'zh_CN' : 'en'
      return formatI18nMessage(
        catalogs[locale][messageKey] ?? catalogs.en[messageKey] ?? '',
        parameters,
      )
    },
  }),
}

/**
 * Invalid or removed preferences fall back to the browser's language.
 */
export function parseLanguagePreference(value: unknown): LanguagePreference {
  return value === 'zh-CN' || value === 'en' ? value : 'browser'
}

/**
 * Registers storage synchronization before reading the initial preference, so a
 * concurrent settings change cannot be overwritten by an older snapshot.
 */
export function initializeI18n() {
  if (initialization) {
    return initialization
  }
  const onChanged = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ) => {
    if (area === 'local' && Object.hasOwn(changes, LANGUAGE_STORAGE_KEY)) {
      revision++
      selectedLanguage.value = parseLanguagePreference(
        changes[LANGUAGE_STORAGE_KEY]?.newValue,
      )
    }
  }
  browser.storage.onChanged.addListener(onChanged)
  const initialRevision = revision
  initialization = browser.storage.local
    .get(LANGUAGE_STORAGE_KEY)
    .then(stored => {
      if (revision === initialRevision) {
        selectedLanguage.value = parseLanguagePreference(
          stored[LANGUAGE_STORAGE_KEY],
        )
      }
    })
    .catch(error => {
      browser.storage.onChanged.removeListener(onChanged)
      initialization = undefined
      throw error
    })
  return initialization
}

/**
 * Persists the display language independently of download settings and tasks.
 */
export async function setLanguagePreference(preference: LanguagePreference) {
  await initializeI18n()
  const beforeUpdate = revision
  await browser.storage.local.set({ [LANGUAGE_STORAGE_KEY]: preference })
  if (revision === beforeUpdate) {
    selectedLanguage.value = preference
  }
}

/**
 * Initializes extension document metadata with the effective browser locale.
 */
export async function initializePageI18n(
  titleKey:
    | 'extensionName'
    | 'pages.optionsTitle'
    | 'pages.downloadsTitle'
    | 'pages.welcomeTitle',
) {
  await initializeI18n().catch(console.warn)
  watchEffect(() => {
    document.documentElement.lang = i18n.t('localeCode')
    document.title = i18n.t(titleKey)
  })
}

/**
 * Dedicated media workers cannot access extension APIs. Install the localized
 * messages supplied by their parent before executing any media operations.
 */
export function initializeWorkerI18n(messages: Record<string, string>) {
  i18n.t = new Proxy(extensionI18n.t, {
    apply(_target, _thisArgument, args: unknown[]) {
      const [key, substitutions] = args
      if (typeof key !== 'string' || !Object.hasOwn(messages, key)) {
        throw new Error(`Missing worker translation: ${String(key)}`)
      }
      return formatI18nMessage(messages[key] ?? '', [substitutions])
    },
  })
}
