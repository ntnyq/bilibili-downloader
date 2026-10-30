import { browser } from '#imports'
import { i18n } from '~/utils/i18n'

const contextMenus = {
  openOptionsPage: 'open-options-page',
}

export function registerContextmenu() {
  browser.contextMenus.create({
    id: contextMenus.openOptionsPage,
    title: i18n.t('common.openOptions'),
  })

  browser.contextMenus.onClicked.addListener(params => {
    if (params.menuItemId === contextMenus.openOptionsPage) {
      browser.runtime.openOptionsPage()
    }
  })
}
