import assert from 'node:assert/strict'
import { test } from 'node:test'
import { browser } from 'wxt/browser'
import { downloadJobSchema } from '../../types/download'
import { installExtension, replaceProperty } from '../support/extension'

const { startDownloadRunner } =
  await import('../../utils/downloads/queue/runner')
const { registerDownloads } =
  await import('../../entrypoints/background/services/downloads')
const { requestSchema } = await import('../../utils/downloads/messages')

for (const failure of [
  'runner.ready',
  'queue.list',
  'runner.claim',
  'runner.update',
  'saving',
  'downloadId',
  'history',
  'historyStorage',
] as const) {
  test(
    failure === 'history' || failure === 'historyStorage'
      ? `runner keeps a saved file completed after ${failure} failure`
      : `runner recovers a lost ${failure} reply without saving twice`,
    { timeout: 10000 },
    async context => {
      const extension = installExtension(context)
      registerDownloads()
      if (failure === 'history') {
        extension.stored.downloadLibrary = { version: 999, records: [] }
      }
      if (failure === 'historyStorage') {
        extension.stored.downloadLibrary = { version: 1, records: [] }
        const set = extension.local.set.bind(extension.local)
        context.mock.method(
          extension.local,
          'set',
          async (values: Record<string, unknown>) => {
            if ('downloadLibrary' in values) {
              throw new Error('History quota exceeded')
            }
            await set(values)
          },
        )
      }
      extension.stored.downloadJobs = [
        downloadJobSchema.parse({
          id: 'cover',
          bvid: 'BV1xx411c7mD',
          cid: 1,
          page: 1,
          part: 'P1',
          duration: 1,
          title: 'Cover',
          cover: 'https://i0.hdslb.com/cover.png',
          pageCount: 1,
          createdAt: 1,
          kind: 'cover',
          status: 'queued',
          progress: 0,
          receivedBytes: 0,
          totalBytes: 0,
        }),
      ]
      const stop = new AbortController()
      context.after(() => stop.abort())
      replaceProperty(context, globalThis, 'navigator', {
        locks: {
          async request(
            name: string,
            options: LockOptions,
            action: (lock: { name: string }) => unknown,
          ) {
            assert.ok(!options.ifAvailable || !options.signal)
            return action({ name })
          },
        },
        storage: {
          async getDirectory() {
            return {
              getDirectoryHandle() {
                throw new DOMException('No cache', 'NotFoundError')
              },
            }
          },
        },
      })
      context.mock.method(
        globalThis,
        'fetch',
        async () =>
          new Response(
            new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          ),
      )
      let saves = 0
      replaceProperty(context, browser, 'downloads', {
        async download() {
          saves++
          return 1
        },
        search: async () => [{ state: 'complete' }],
        cancel: async () => {},
      })
      const send = browser.runtime.sendMessage.bind(browser.runtime)
      let failed = false
      const errors: string[] = []
      context.mock.method(
        browser.runtime,
        'sendMessage',
        async (message: unknown) => {
          const request = requestSchema.parse(message)
          const jobs = downloadJobSchema
            .array()
            .parse(extension.stored.downloadJobs)
          if (
            request.type === 'runner.claim'
            && jobs[0]?.status === 'completed'
          ) {
            stop.abort()
            throw stop.signal.reason
          }
          const reply = await send(message)
          const loseReply =
            request.type === 'runner.update'
              ? ((failure === 'runner.update' || failure === 'historyStorage')
                  && request.update.status === 'completed')
                || (failure === 'saving' && request.update.status === 'saving')
                || (failure === 'downloadId'
                  && request.update.downloadId !== undefined)
              : request.type === failure
          if (!failed && loseReply) {
            failed = true
            if (failure === 'runner.ready') {
              await extension.local.set({
                downloadJobs: [
                  ...jobs,
                  {
                    ...jobs[0],
                    id: 'native',
                    kind: 'video',
                    status: 'native',
                    runId: crypto.randomUUID(),
                  },
                ],
              })
            }
            throw new Error('Reply lost')
          }
          return reply
        },
      )
      await assert.rejects(
        startDownloadRunner(message => errors.push(message), stop.signal),
        { name: 'AbortError' },
      )
      const jobs = downloadJobSchema
        .array()
        .parse(extension.stored.downloadJobs)
      assert.equal(jobs[0]?.status, 'completed')
      assert.equal(saves, 1)
      assert.equal(failed, failure !== 'history')
      if (failure === 'history' || failure === 'historyStorage') {
        assert.match(jobs[0]?.error ?? '', /已保存.*历史/)
      }
      if (failure !== 'history') {
        assert.ok(errors.includes('Reply lost'))
      }
      assert.equal(errors.at(-1), '')
      if (failure === 'runner.ready') {
        assert.equal(jobs[1]?.status, 'native')
      }
    },
  )
}
