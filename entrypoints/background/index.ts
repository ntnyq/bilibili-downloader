import { browser, defineBackground } from '#imports'
import { registerActionIcon } from './services/actionIcon'
import { registerDownloads } from './services/downloads'

export default defineBackground(() => {
  registerActionIcon()
  registerDownloads()
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') })
    }
  })
})
