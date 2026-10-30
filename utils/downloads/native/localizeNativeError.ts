import { catalogs } from '#i18n-catalogs'
import { formatI18nMessage } from '~/utils/formatI18nMessage'
import { i18n } from '~/utils/i18n'

const messages = Object.entries(catalogs.zh_CN)
  .filter(([key]) => key.startsWith('nativeHelper_'))
  .map(([key, message]) => ({
    key,
    pattern: new RegExp(
      `^${message
        .split(/\$\d/g)
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('([\\s\\S]+?)')}$`,
    ),
  }))

/**
 * Older installed helpers report Chinese diagnostics. Translate their known
 * messages at the extension boundary without requiring a protocol upgrade or
 * discarding unfamiliar diagnostics from other helper versions.
 */
export function localizeNativeError(message: string): string {
  const { nativeHelper_retryAdvice: retryAdvice } = catalogs.zh_CN
  if (retryAdvice && message !== retryAdvice && message.endsWith(retryAdvice)) {
    return `${localizeNativeError(message.slice(0, -retryAdvice.length).trimEnd())} ${i18n.t('nativeHelper.retryAdvice')}`
  }
  for (const { key, pattern } of messages) {
    const match = pattern.exec(message)
    if (match) {
      const locale = i18n.t('localeCode') === 'zh-CN' ? 'zh_CN' : 'en'
      return formatI18nMessage(catalogs[locale][key] ?? message, [
        match.slice(1),
      ])
    }
  }
  return message
}
