import { browser } from '#imports'

const contextMenus = {
  openOptionsPage: 'open-options-page',
}

export function registerContextmenu() {
  browser.contextMenus.create({
    id: contextMenus.openOptionsPage,
    title: 'Open Options Page',
  })

  browser.contextMenus.onClicked.addListener(params => {
    if (params.menuItemId === contextMenus.openOptionsPage) {
      browser.runtime.openOptionsPage()
    }
  })
}
