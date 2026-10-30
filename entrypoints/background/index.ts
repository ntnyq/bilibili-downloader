import { browser, defineBackground } from '#imports'
import { initializeI18n } from '~/utils/i18n'
import { registerActionIcon } from './services/actionIcon'
import { registerDownloads } from './services/downloads'

export default defineBackground(() => {
  registerActionIcon()
  registerDownloads(initializeI18n().catch(console.warn))
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') })
    }
  })
})
