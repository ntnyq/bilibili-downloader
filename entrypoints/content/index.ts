import '~/assets/tailwind.css'
import { createApp, shallowRef } from 'vue'
import { createShadowRootUi, defineContentScript } from '#imports'
import { DOWNLOAD_PAGE_MATCHES } from '~/constants/contentScript'
import App from './App.vue'

export default defineContentScript({
  matches: DOWNLOAD_PAGE_MATCHES,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const url = shallowRef(window.location.href)
    ctx.addEventListener(window, 'wxt:locationchange', event => {
      // Navigation API dispatches before window.location has changed.
      url.value = event.newUrl.href
    })
    const ui = await createShadowRootUi(ctx, {
      name: 'bilibili-downloader',
      position: 'inline',
      // Wait for Bilibili to hydrate its SSR tree before inserting a sibling.
      // The player precedes the toolbar and is not a safe fallback anchor.
      anchor:
        '#app:not([data-server-rendered]) :is(#arc_toolbar_report, .video-toolbar-container, .video-toolbar)',
      append: 'after',
      isolateEvents: true,
      onMount(container) {
        const app = createApp(App, { getUrl: () => url.value })
        app.mount(container)
        return app
      },
      onRemove(app) {
        app?.unmount()
      },
    })
    ui.autoMount()
  },
})
