import { registerHooks } from 'node:module'
import { browser } from 'wxt/browser'
import type { TestContext } from 'node:test'
import type { Browser } from 'wxt/browser'

interface TestStorage extends Record<string, unknown> {
  downloadJobs?: unknown
  downloadLibrary?: unknown
  downloadRunnerTabId?: unknown
  downloadJobsRecoveryBackup?: unknown
}

// WXT supplies this virtual module in extension builds, not in Node tests.
registerHooks({
  resolve(specifier, context, next) {
    return specifier === '#imports'
      ? {
          url: 'data:text/javascript,export const browser = globalThis.chrome',
          shortCircuit: true,
        }
      : next(specifier, context)
  },
})

export function createEvent<Arguments extends unknown[]>() {
  const listeners = new Set<(...args: Arguments) => unknown>()
  return {
    addListener(listener: (...args: Arguments) => unknown) {
      return listeners.add(listener)
    },
    removeListener(listener: (...args: Arguments) => unknown) {
      return listeners.delete(listener)
    },
    emit(...args: Arguments) {
      return Promise.all([...listeners].map(listener => listener(...args)))
    },
    listeners,
  }
}

export function replaceProperty(
  context: TestContext,
  target: object,
  key: PropertyKey,
  value: unknown,
) {
  const previous = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { configurable: true, value })
  context.after(() => {
    if (previous) {
      Object.defineProperty(target, key, previous)
    } else {
      Reflect.deleteProperty(target, key)
    }
  })
}

export function installExtension(context: TestContext) {
  const stored: TestStorage = {}
  const changes =
    createEvent<[Record<string, Browser.storage.StorageChange>, string]>()
  const messages =
    createEvent<
      [unknown, Browser.runtime.MessageSender, (reply: unknown) => void]
    >()
  const removed = createEvent<[number]>()
  const updated = createEvent<[number, { url?: string }]>()
  const tabs = [
    { id: 1, windowId: 1, url: 'chrome-extension://test/downloads.html' },
  ]
  const local = {
    async get(keys: string | string[]) {
      return Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys]).map(key => [
          key,
          structuredClone(stored[key]),
        ]),
      )
    },
    async set(values: Record<string, unknown>) {
      const patch = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [
          key,
          {
            oldValue: structuredClone(stored[key]),
            newValue: structuredClone(value),
          },
        ]),
      )
      Object.assign(stored, structuredClone(values))
      await changes.emit(patch, 'local')
    },
    async remove(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        const oldValue = stored[key]
        delete stored[key]
        await changes.emit({ [key]: { oldValue } }, 'local')
      }
    },
  }
  const sender = {
    id: browser.runtime.id,
    url: tabs[0]!.url,
    // Only the sender fields used by the extension boundary are modeled here.
    tab: tabs[0] as Browser.tabs.Tab,
  }
  const request = (message: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      if (!messages.listeners.size) {
        reject(new Error('No background message listener'))
        return
      }
      messages
        .emit(message, sender, reply => resolve(structuredClone(reply)))
        .catch(reject)
    })
  for (const [key, value] of Object.entries({
    getURL: (path: string) => `chrome-extension://test${path}`,
    onMessage: messages,
    sendMessage: request,
  })) {
    replaceProperty(context, browser.runtime, key, value)
  }
  replaceProperty(context, browser.storage, 'local', local)
  replaceProperty(context, browser.storage, 'onChanged', changes)
  replaceProperty(context, browser, 'tabs', {
    onRemoved: removed,
    onUpdated: updated,
    query: async () => tabs,
    create: async () => tabs[0],
    get: async () => tabs[0],
    update: async () => tabs[0],
  })
  replaceProperty(context, browser, 'windows', { update: async () => {} })
  replaceProperty(context, browser, 'permissions', {
    contains: async () => false,
    request: async () => true,
  })
  replaceProperty(context, browser, 'declarativeNetRequest', {
    updateSessionRules: async () => {},
  })
  replaceProperty(context, browser, 'downloads', {
    search: async () => [],
    cancel: async () => {},
  })
  return {
    stored,
    local,
    sender,
    removed,
    updated,
  }
}
