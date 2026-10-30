import process from 'node:process'
import { generateChromeMessages, parseMessagesFile } from '@wxt-dev/i18n/build'

const { TEST_LOCALE } = process.env
const locale = TEST_LOCALE || 'zh_CN'
const fallback = generateChromeMessages(
  await parseMessagesFile(
    new URL('../../locales/en.yaml', import.meta.url).pathname,
  ),
)
const messages = generateChromeMessages(
  await parseMessagesFile(
    new URL(`../../locales/${locale}.yaml`, import.meta.url).pathname,
  ),
)
const storageData: Record<string, unknown> = {}
type StorageListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  area: string,
) => void
const storageListeners = new Set<StorageListener>()

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    runtime: { id: 'bilibili-downloader-test' },
    storage: {
      onChanged: {
        addListener(listener: StorageListener) {
          return storageListeners.add(listener)
        },
        removeListener(listener: StorageListener) {
          return storageListeners.delete(listener)
        },
      },
      local: {
        async get(key: string) {
          return {
            [key]: storageData[key],
          }
        },
        async set(values: Record<string, unknown>) {
          const changes = Object.fromEntries(
            Object.entries(values).map(([key, newValue]) => [
              key,
              { oldValue: storageData[key], newValue },
            ]),
          )
          Object.assign(storageData, values)
          for (const listener of storageListeners) {
            listener(changes, 'local')
          }
        },
        async remove(key: string) {
          const oldValue = storageData[key]
          delete storageData[key]
          for (const listener of storageListeners) {
            listener({ [key]: { oldValue } }, 'local')
          }
        },
      },
    },
    i18n: {
      getUILanguage: () => locale.replace('_', '-'),
      getMessage(key: string, substitutions: string[] = []) {
        if (key === '@@ui_locale') {
          return locale
        }
        return (messages[key]?.message ?? fallback[key]?.message ?? '').replace(
          /\$(\d)/g,
          (placeholder, index) =>
            substitutions[Number(index) - 1] ?? placeholder,
        )
      },
    },
  },
})
