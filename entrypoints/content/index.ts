import '~/assets/tailwind.css'
import { createApp, shallowRef } from 'vue'
import { createShadowRootUi, defineContentScript } from '#imports'
import { DOWNLOAD_PAGE_MATCHES } from '~/constants/contentScript'
import { initializeI18n } from '~/utils/i18n'
import App from './App.vue'

export default defineContentScript({
  matches: DOWNLOAD_PAGE_MATCHES,
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main(ctx) {
    await initializeI18n().catch(console.warn)
    const url = shallowRef(window.location.href)
    ctx.addEventListener(window, 'wxt:locationchange', event => {
      // Navigation API dispatches before window.location has changed.
      url.value = event.newUrl.href
    })
    const ui = await createShadowRootUi(ctx, {
      name: 'bilibili-downloader',
      position: 'inline',
      css: `:host {
        display: inline-flex !important;
        position: relative !important;
        z-index: 1000 !important;
        vertical-align: middle !important;
        margin-left: 12px !important;
      }`,
      // Wait for Bilibili to hydrate its SSR tree before adding the action.
      anchor:
        '#app:not([data-server-rendered]) :is(#arc_toolbar_report, .video-toolbar-container, .video-toolbar)',
      append(anchor, host) {
        const actions = anchor.querySelector('.video-toolbar-right') || anchor
        actions.append(host)
      },
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
