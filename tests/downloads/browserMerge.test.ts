import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeBrowserMedia } from '../../utils/downloads/media/mergeBrowserMedia'
import type { TestContext } from 'node:test'
import type {
  RemuxRequest,
  RemuxResponse,
} from '../../utils/downloads/media/remux.worker'

function installBrowser(
  context: TestContext,
  options: {
    freeBytes?: number
    onPost?: () => void
    response?: RemuxResponse
    removeLocks?: number
    fileError?: Error
  } = {},
) {
  const removed: string[] = []
  const directories: string[] = []
  const messages: RemuxRequest[] = []
  let removalAttempts = 0
  let workers = 0
  let terminated = 0
  let files = 0
  let respondToWorker: ((data: RemuxResponse) => void) | undefined
  const posted = Promise.withResolvers<void>()
  const directory = {
    async getDirectoryHandle(name: string) {
      directories.push(name)
      return directory
    },
    async getFileHandle() {
      files++
      if (options.fileError) {
        throw options.fileError
      }
      return {
        async getFile() {
          return new File(['media'], 'output.media', { type: 'text/plain' })
        },
      }
    },
    async removeEntry(name: string, optionsValue: { recursive: boolean }) {
      assert.equal(optionsValue.recursive, true)
      if (removalAttempts++ < (options.removeLocks ?? 0)) {
        throw new DOMException('stream locked', 'NoModificationAllowedError')
      }
      removed.push(name)
    },
  }
  class RemuxWorker extends EventTarget {
    constructor() {
      super()
      workers++
      respondToWorker = data =>
        this.dispatchEvent(new MessageEvent('message', { data }))
    }

    postMessage(message: RemuxRequest) {
      messages.push(message)
      assert.equal(message.directory, directory)
      options.onPost?.()
      posted.resolve()
      if (options.response) {
        queueMicrotask(() =>
          this.dispatchEvent(
            new MessageEvent('message', { data: options.response }),
          ),
        )
      }
    }

    terminate() {
      terminated++
    }
  }
  const globals = {
    navigator: {
      storage: {
        async estimate() {
          return {
            quota: options.freeBytes ?? 1024 ** 3,
            usage: 0,
          }
        },
        getDirectory: async () => directory,
      },
    },
    Worker: RemuxWorker,
  }
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value })
    context.after(() => {
      if (previous) {
        Object.defineProperty(globalThis, name, previous)
      } else {
        Reflect.deleteProperty(globalThis, name)
      }
    })
  }
  return {
    removed,
    directories,
    messages,
    removalAttempts: () => removalAttempts,
    workers: () => workers,
    terminated: () => terminated,
    files: () => files,
    posted: posted.promise,
    respond(data: RemuxResponse) {
      assert.ok(respondToWorker)
      respondToWorker(data)
    },
  }
}

test('keeps the disk output alive for saving and supplies the correct media MIME', async context => {
  const browser = installBrowser(context, { response: { type: 'complete' } })
  for (const kind of ['dash', 'audio', 'progressive'] as const) {
    const before = browser.removed.length
    const output = await mergeBrowserMedia(
      kind,
      [new Blob(['input'])],
      new AbortController().signal,
      () => {},
    )
    assert.equal(
      output.blob.type,
      kind === 'audio' ? 'audio/x-m4a' : 'video/mp4',
    )
    assert.equal(await output.blob.text(), 'media')
    assert.equal(browser.removed.length, before)
    await output.dispose()
    assert.equal(browser.removed.length, before + 1)
    assert.equal(browser.removed.at(-1), browser.directories.at(-1))
    assert.equal(browser.messages.at(-1)?.kind, kind)
  }
  assert.equal(browser.workers(), 3)
  assert.equal(browser.terminated(), 3)
})

test('refuses insufficient output quota before creating files or starting a worker', async context => {
  const browser = installBrowser(context, { freeBytes: 1 })
  await assert.rejects(
    mergeBrowserMedia(
      'audio',
      [new Blob(['input'])],
      new AbortController().signal,
      () => {},
    ),
    /配额不足/,
  )
  assert.equal(browser.workers(), 0)
  assert.equal(browser.files(), 0)
})

test('terminates a cancelled worker and removes the unfinished output', async context => {
  const controller = new AbortController()
  const browser = installBrowser(context, { onPost: () => controller.abort() })
  await assert.rejects(
    mergeBrowserMedia(
      'audio',
      [new Blob(['input'])],
      controller.signal,
      () => {},
    ),
    { name: 'AbortError' },
  )
  assert.ok(browser.terminated() > 0)
  assert.equal(browser.removed.length, 1)
})

test('reports worker quota failures and removes their partial output', async context => {
  const browser = installBrowser(context, {
    response: {
      type: 'error',
      name: 'QuotaExceededError',
      message: 'disk full',
    },
  })
  await assert.rejects(
    mergeBrowserMedia(
      'audio',
      [new Blob(['input'])],
      new AbortController().signal,
      () => {},
    ),
    /缓存空间不足/,
  )
  assert.equal(browser.removed.length, 1)
})

test('only times out a worker that never acknowledges startup', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const browser = installBrowser(context)
  const pending = mergeBrowserMedia(
    'audio',
    [new Blob(['input'])],
    new AbortController().signal,
    () => {},
  )
  const rejected = assert.rejects(pending, /Worker 启动超时/)
  await browser.posted
  context.mock.timers.tick(120000)
  await rejected
  assert.ok(browser.terminated() > 0)
  assert.equal(browser.removed.length, 1)
})

test('keeps an acknowledged worker alive through long parsing and finalization without byte progress', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const browser = installBrowser(context)
  const progress: number[] = []
  const pending = mergeBrowserMedia(
    'audio',
    [new Blob(['input'])],
    new AbortController().signal,
    bytes => progress.push(bytes),
  )
  await browser.posted
  browser.respond({ type: 'ready' })
  context.mock.timers.tick(31 * 60 * 1000)
  browser.respond({ type: 'progress', bytes: 5 })
  context.mock.timers.tick(31 * 60 * 1000)
  assert.equal(browser.terminated(), 0)
  assert.equal(browser.removed.length, 0)
  browser.respond({ type: 'complete' })
  const output = await pending
  assert.deepEqual(progress, [5])
  assert.equal(output.blob.size, 5)
  await output.dispose()
})

test('can cancel an acknowledged worker after a long period without progress', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const controller = new AbortController()
  const browser = installBrowser(context)
  const pending = mergeBrowserMedia(
    'progressive',
    [new Blob(['input'])],
    controller.signal,
    () => {},
  )
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  await browser.posted
  browser.respond({ type: 'ready' })
  context.mock.timers.tick(2 * 60 * 60 * 1000)
  controller.abort()
  await rejected
  assert.ok(browser.terminated() > 0)
  assert.equal(browser.removed.length, 1)
})

test('retries transient OPFS locks when removing the entire output/index directory', async context => {
  const browser = installBrowser(context, {
    response: { type: 'complete' },
    removeLocks: 2,
  })
  const output = await mergeBrowserMedia(
    'audio',
    [new Blob(['input'])],
    new AbortController().signal,
    () => {},
  )
  await output.dispose()
  assert.equal(browser.removalAttempts(), 3)
  assert.equal(browser.removed.length, 1)
})

test('cleans the job directory when creating the output file fails', async context => {
  const failure = new DOMException('disk full', 'QuotaExceededError')
  const browser = installBrowser(context, { fileError: failure })
  await assert.rejects(
    mergeBrowserMedia(
      'audio',
      [new Blob(['input'])],
      new AbortController().signal,
      () => {},
    ),
    error => error === failure,
  )
  assert.equal(browser.workers(), 0)
  assert.equal(browser.removed.length, 1)
  assert.equal(browser.removed[0], browser.directories.at(-1))
})
