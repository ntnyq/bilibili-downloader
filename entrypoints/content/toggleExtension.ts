import { createApp } from 'vue'
import App from './App.vue'
import type { ContentScriptContext } from '#imports'

export function exit() {
  if (window.__contentScriptUI__) {
    window.__contentScriptUI__?.remove()
    window.__contentScriptUI__ = undefined
  }
}

export async function openContentApp(ctx: ContentScriptContext) {
  const ui = createIntegratedUi(ctx, {
    position: 'inline',
    onMount(container) {
      const app = createApp(App)
      app.mount(container)
      return app
    },
    onRemove(app) {
      app?.unmount()
    },
  })

  window.__contentScriptUI__ = ui
  ui.mount()
}

export async function toggleExtension(ctx: ContentScriptContext) {
  if (window.__contentScriptUI__) {
    exit()
  } else {
    await openContentApp(ctx)
  }
}
