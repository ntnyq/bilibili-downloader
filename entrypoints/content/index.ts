import '~/assets/tailwind.css'
import { createApp, shallowRef } from 'vue'
import { createShadowRootUi, defineContentScript } from '#imports'
import App from './App.vue'

export default defineContentScript({
  matches: ['https://www.bilibili.com/video/*'],
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
      anchor:
        '#arc_toolbar_report, .video-toolbar-container, .video-toolbar, #bilibili-player',
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
