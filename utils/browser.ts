import { browser } from '#imports'
import { logger } from '~/utils/logger'
import type { Browser } from '#imports'

export async function showNotification(
  options: Browser.notifications.NotificationOptions = {},
) {
  try {
    const confirmed = await browser.permissions.request({
      permissions: ['notifications'],
    })

    if (!confirmed) {
      return
    }

    browser.notifications.create({
      type: options.type || 'basic',
      title: options.title || i18n.t('extensionName'),
      iconUrl: options.iconUrl || '/icons/128.png',
      message: options.message || 'Hello World',
    })
  } catch (error) {
    console.log(error)
  }
}

export async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

export async function createNewTab(
  options: Browser.tabs.CreateProperties = {},
) {
  const tab = await getActiveTab()
  if (!tab) {
    return
  }
  browser.tabs.create(
    options.url
      ? { url: options.url, index: tab.index + 1 }
      : {
          url: 'https://github.com/ntnyq',
          index: tab.index + 1,
        },
  )
}

export async function clearCacheAndRefresh() {
  logger.info('clear cache and refresh')

  window.localStorage.clear()
  window.sessionStorage.clear()
  window.location.reload()
}

export async function captureTabScreen(
  options: Partial<Browser.extensionTypes.ImageDetails> = {},
) {
  const tab = await getActiveTab()

  if (!tab?.windowId) {
    return
  }

  const image = await browser.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
    quality: 100,
    ...options,
  })

  if (browser.runtime.lastError) {
    logger.error(browser.runtime.lastError)
    return
  }

  logger.info('capture tab screen', image)
}

export function openPopupWindow() {
  browser.action.openPopup()
}

/**
 * permissions:
 *  - `bookmarks`
 */
export function openBookmarkPage() {
  const extendsionId = browser.runtime.id
  createNewTab({ url: `chrome-extension://${extendsionId}/bookmark.html` })
}
