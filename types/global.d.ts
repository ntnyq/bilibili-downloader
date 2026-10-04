/**
 * @file Global types
 */

import type { App } from 'vue'
import type { IntegratedContentScriptUi } from '#imports'

declare global {
  interface Window {
    /** Only can be accessed in content script */
    __contentScriptUI__?: IntegratedContentScriptUi<App<Element>>
  }
}
