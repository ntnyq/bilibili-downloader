import { MatchPattern } from 'wxt/utils/match-patterns'
import { browser } from '#imports'
import { DOWNLOAD_PAGE_MATCHES } from '~/constants/contentScript'
import { createLogger } from '~/utils/logger'

const ICON_PATHS = {
  16: '/icons/16.png',
  32: '/icons/32.png',
} as const

const logger = createLogger('action-icon')

/**
 * Creates grayscale toolbar icons in both background pages and service workers.
 */
async function createGrayscaleIcons() {
  const entries = await Promise.all(
    Object.entries(ICON_PATHS).map(async ([size, path]) => {
      const response = await fetch(browser.runtime.getURL(path))
      if (!response.ok) {
        throw new Error(`Failed to load toolbar icon: ${path}`)
      }
      const bitmap = await createImageBitmap(await response.blob())
      const canvas = new OffscreenCanvas(Number(size), Number(size))
      const context = canvas.getContext('2d')
      if (!context) {
        bitmap.close()
        throw new Error('Unable to create toolbar icon canvas')
      }
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      for (let index = 0; index < image.data.length; index += 4) {
        const gray = Math.round(
          (image.data[index] ?? 0) * 0.2126
            + (image.data[index + 1] ?? 0) * 0.7152
            + (image.data[index + 2] ?? 0) * 0.0722,
        )
        image.data[index] = gray
        image.data[index + 1] = gray
        image.data[index + 2] = gray
      }
      return [size, image] as const
    }),
  )
  return Object.fromEntries(entries)
}

/**
 * Keeps the toolbar icon in sync with each tab's downloadable page match.
 */
export function registerActionIcon() {
  const patterns = DOWNLOAD_PAGE_MATCHES.map(match => new MatchPattern(match))
  const grayscaleIcons = createGrayscaleIcons()

  async function updateIcon(tabId: number) {
    try {
      const imageData = await grayscaleIcons
      const tab = await browser.tabs.get(tabId)
      const url = tab.url
      const isSupported =
        !!url && patterns.some(pattern => pattern.includes(url))
      await browser.action.setIcon(
        isSupported ? { tabId, path: ICON_PATHS } : { tabId, imageData },
      )
    } catch (error) {
      logger.warn('Unable to update toolbar icon', error)
    }
  }

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url !== undefined || changeInfo.status !== undefined) {
      updateIcon(tabId)
    }
  })
  browser.tabs.onActivated.addListener(({ tabId }) => {
    updateIcon(tabId)
  })
  browser.tabs.onCreated.addListener(tab => {
    if (tab.id !== undefined) {
      updateIcon(tab.id)
    }
  })

  async function initializeIcons() {
    await browser.action.setIcon({ imageData: await grayscaleIcons })
    const tabs = await browser.tabs.query({})
    await Promise.all(
      tabs.map(tab => (tab.id === undefined ? undefined : updateIcon(tab.id))),
    )
  }
  initializeIcons().catch(error => {
    logger.warn('Unable to initialize toolbar icons', error)
  })
}
