import { writeFile } from 'node:fs/promises'
import { generateChromeMessages, parseMessagesFile } from '@wxt-dev/i18n/build'
import { resolve } from './utils'
import type { WxtViteConfig } from 'wxt'

/**
 * Builds manual-language catalogs from the same source as browser messages.
 */
export async function createI18nCatalogModule() {
  const catalogs = Object.fromEntries(
    await Promise.all(
      ['en', 'zh_CN'].map(async locale => {
        const messages = generateChromeMessages(
          await parseMessagesFile(resolve(`locales/${locale}.yaml`)),
        )
        return [
          locale,
          Object.fromEntries(
            Object.entries(messages).map(([key, value]) => [
              key,
              value.message,
            ]),
          ),
        ]
      }),
    ),
  )
  return `export const catalogs: Record<'en' | 'zh_CN', Record<string, string>> = ${JSON.stringify(catalogs)}`
}

/**
 * WXT refreshes native messages on locale edits; also invalidate the catalogs
 * used by manual language selection in Vite's module graph.
 */
export function runtimeI18nPlugin(): NonNullable<
  WxtViteConfig['plugins']
>[number] {
  return {
    name: 'runtime-i18n-catalogs',
    configureServer(server) {
      const files = new Set(
        ['en', 'zh_CN'].map(locale => resolve(`locales/${locale}.yaml`)),
      )
      let pending = Promise.resolve()
      const update = (file: string) => {
        if (!files.has(file)) {
          return
        }
        pending = pending
          .then(async () => {
            await writeFile(
              resolve('.wxt/i18n/catalogs.ts'),
              await createI18nCatalogModule(),
              'utf8',
            )
          })
          .catch(error => server.config.logger.error(String(error)))
      }
      server.watcher.add([...files])
      server.watcher.on('change', update)
      server.httpServer?.once('close', () =>
        server.watcher.off('change', update),
      )
    },
  }
}
