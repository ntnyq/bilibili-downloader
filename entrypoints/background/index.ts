import { browser, defineBackground } from '#imports'
import { registerDownloads } from './services/downloads'

export default defineBackground(() => {
  registerDownloads()
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') })
    }
  })
})
