import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computed, readonly, shallowRef, watch } from 'vue'
import { browser } from 'wxt/browser'
import { z } from 'zod'
import { downloadJobSchema, downloadJobsSchema } from '../../types/download'
import { downloadLibrarySchema } from '../../types/downloadHistory'
import { setLanguagePreference } from '../../utils/i18n'
import {
  createEvent,
  installExtension,
  replaceProperty,
} from '../support/extension'
import type { NativeEvent } from '../../types/nativeBridge'
import type { NativeManifest } from '../../utils/downloads/native/bridge'

const { useNativeBridge } = await import('../../composables/useNativeBridge')
const { registerDownloads } =
  await import('../../entrypoints/background/services/downloads')
const { requestSchema, sendDownloadMessage } =
  await import('../../utils/downloads/messages')

const scenarios = [
  ['refresh', 'native refresh freezes the output path across language changes'],
  ['changedMedia', 'native refresh still rejects a changed representation'],
  [
    'lostStart',
    'native handoff retries a lost start reply on the original lease',
  ],
  [
    'retryWrites',
    'native completion survives failed queue writes and a lost reply without cancelling',
  ],
  [
    'cancelCompleted',
    'native cancellation records a file the helper already saved',
  ],
  ['cancelConfirmed', 'native cancellation waits for the helper to stop'],
] as const

for (const [scenario, description] of scenarios) {
  const changedMedia = scenario === 'changedMedia'
  const isCancelling =
    scenario === 'cancelCompleted' || scenario === 'cancelConfirmed'

  test(
    description,
    // The write recovery scenario exercises two real backoff delays.
    { timeout: 10000 },
    async context => {
      const extension = installExtension(context)

      registerDownloads()
      replaceProperty(context, globalThis, 'window', new EventTarget())

      // Supply the Vue globals normally injected by WXT.
      for (const [key, value] of Object.entries({
        computed,
        readonly,
        shallowRef,
      })) {
        replaceProperty(context, globalThis, key, value)
      }

      const job = downloadJobSchema.parse({
        id: crypto.randomUUID(),
        bvid: 'BV1xx411c7mD',
        cid: 1,
        page: 1,
        part: 'P1',
        duration: 1,
        title: 'Test',
        cover: '',
        pageCount: 1,
        createdAt: 1,
        status: 'paused',
        kind: 'audio',
        filenameTemplate: '{type}_{title}',
        progress: 0,
        receivedBytes: 0,
        totalBytes: 0,
      })

      extension.stored.downloadJobs = [job]
      extension.stored.downloadRunnerTabId = 1
      let refreshed = false

      context.mock.method(
        globalThis,
        'fetch',
        async (input: RequestInfo | URL) =>
          Response.json({
            code: 0,
            data: String(input).includes('/nav')
              ? {
                  wbi_img: {
                    img_url: `https://i0.hdslb.com/${'a'.repeat(32)}.png`,
                    sub_url: `https://i0.hdslb.com/${'b'.repeat(32)}.png`,
                  },
                }
              : {
                  dash: {
                    audio: [
                      {
                        id: changedMedia && refreshed ? 2 : 1,
                        codecs: 'mp4a.40.2',
                        bandwidth: 128000,
                        baseUrl: `https://cdn.bilivideo.com/audio?token=${refreshed ? 'new' : 'old'}`,
                      },
                    ],
                  },
                },
          }),
      )
      const incoming = createEvent<[NativeEvent]>()
      const disconnected = createEvent<[]>()
      const sent: {
        type: string
        requestId: string
        manifest: NativeManifest
      }[] = []
      const outcome = Promise.withResolvers<string>()

      replaceProperty(context, browser.runtime, 'connectNative', () => ({
        onMessage: incoming,
        onDisconnect: disconnected,
        disconnect() {},
        postMessage(message: (typeof sent)[number]) {
          sent.push(message)

          if (message.type !== 'start') {
            outcome.resolve(message.type)
          }

          if (message.type === 'cancel' && !isCancelling) {
            queueMicrotask(() =>
              incoming.emit({
                version: 1,
                requestId: message.requestId,
                type: 'failed',
                error: 'Cancelled',
              }),
            )
          }
        },
      }))
      await setLanguagePreference('zh-CN')
      const bridge = useNativeBridge(() => job)

      const startRunIds: string[] = []

      if (scenario === 'lostStart') {
        const send = browser.runtime.sendMessage.bind(browser.runtime)

        context.mock.method(
          browser.runtime,
          'sendMessage',
          async (message: unknown) => {
            const request = requestSchema.parse(message)
            const reply = await send(message)

            if (request.type === 'native.start') {
              startRunIds.push(request.runId)

              if (startRunIds.length === 1) {
                throw new Error('Start reply lost')
              }
            }

            return reply
          },
        )
      }

      await bridge.start()
      const initial = sent[0]

      assert.ok(initial)

      if (scenario === 'lostStart') {
        const [claimed] = downloadJobsSchema.parse(
          extension.stored.downloadJobs,
        )

        assert.equal(claimed?.status, 'native')
        assert.deepEqual(startRunIds, [claimed.runId, claimed.runId])
        assert.equal(sent.length, 1)
        assert.equal(bridge.error.value, '')
      }

      assert.equal(initial.manifest.filename, 'Bilibili/音频 M4A_Test.m4a')
      await incoming.emit({
        version: 1,
        requestId: initial.requestId,
        type: 'started',
      })

      if (isCancelling) {
        await sendDownloadMessage(
          { type: 'queue.cancel', id: job.id },
          z.null(),
        )
        const [stopping] = await sendDownloadMessage(
          { type: 'queue.list' },
          downloadJobsSchema,
        )

        assert.equal(await outcome.promise, 'cancel')
        assert.equal(stopping?.status, 'native')
        assert.equal(stopping.nativeCancelRequested, true)
        assert.equal(bridge.isRunning.value, true)
        await sendDownloadMessage(
          { type: 'queue.cancel', id: job.id },
          z.null(),
        )
        assert.equal(sent.length, 2)

        const isSaved = scenario === 'cancelCompleted'
        const filename = '/Downloads/Bilibili/Test.m4a'
        const terminal = isSaved
          ? { type: 'completed' as const, filename, quality: 'AAC 128 kbps' }
          : { type: 'failed' as const, error: 'Cancelled' }

        await incoming.emit({
          version: 1,
          requestId: initial.requestId,
          ...terminal,
        })
        const [finished] = await sendDownloadMessage(
          { type: 'queue.list' },
          downloadJobsSchema,
        )
        const { records } = downloadLibrarySchema.parse(
          extension.stored.downloadLibrary,
        )

        assert.equal(finished?.status, isSaved ? 'completed' : 'cancelled')
        assert.equal(records[0]?.filename, isSaved ? filename : undefined)
        assert.equal(bridge.isRunning.value, false)
        assert.ok(stopping.runId)
        assert.equal(
          await sendDownloadMessage(
            {
              type: 'native.update',
              id: job.id,
              runId: stopping.runId,
              update: { status: isSaved ? 'completed' : 'failed' },
            },
            z.boolean(),
          ),
          true,
        )

        return
      }

      if (scenario === 'retryWrites') {
        const send = browser.runtime.sendMessage.bind(browser.runtime)
        const set = extension.local.set.bind(extension.local)
        let lostReply = false
        let completionWrites = 0

        context.mock.method(
          extension.local,
          'set',
          async (values: Record<string, unknown>) => {
            const { downloadJobs } = values
            const result = downloadJobsSchema.safeParse(downloadJobs)
            const current = result.data?.[0]

            if (current?.receivedBytes === 8) {
              throw new Error('Progress write unavailable')
            }

            if (current?.status === 'completed') {
              completionWrites++

              if (completionWrites <= 2) {
                throw new Error('Completion write unavailable')
              }
            }

            await set(values)
          },
        )
        context.mock.method(
          browser.runtime,
          'sendMessage',
          async (message: unknown) => {
            const request = requestSchema.parse(message)
            const reply = await send(message)

            if (
              request.type === 'native.update'
              && request.update.status === 'completed'
              && completionWrites === 3
              && !lostReply
            ) {
              lostReply = true

              throw new Error('Completion reply lost')
            }

            return reply
          },
        )

        for (const receivedBytes of [8, 16]) {
          await incoming.emit({
            version: 1,
            requestId: initial.requestId,
            type: 'progress',
            status: 'downloading',
            receivedBytes,
          })
        }

        const jobs = await sendDownloadMessage(
          { type: 'queue.list' },
          downloadJobsSchema,
        )

        assert.equal(bridge.isRunning.value, true)
        assert.equal(jobs[0]?.receivedBytes, 16)
        await incoming.emit({
          version: 1,
          requestId: initial.requestId,
          type: 'completed',
          filename: '/Downloads/Bilibili/Test.m4a',
          quality: 'AAC 128 kbps',
        })
        const [saved] = await sendDownloadMessage(
          { type: 'queue.list' },
          downloadJobsSchema,
        )
        const library = downloadLibrarySchema.parse(
          extension.stored.downloadLibrary,
        )

        assert.equal(saved?.status, 'completed')
        assert.equal(library.records.length, 1)
        assert.equal(completionWrites, 3)
        assert.equal(lostReply, true)
        assert.equal(bridge.isRunning.value, false)
        assert.equal(bridge.error.value, '')
        assert.deepEqual(
          sent.map(message => message.type),
          ['start'],
        )

        return
      }

      await setLanguagePreference('en')
      refreshed = true
      await incoming.emit({
        version: 1,
        requestId: initial.requestId,
        type: 'refreshRequired',
      })
      assert.equal(await outcome.promise, changedMedia ? 'cancel' : 'refresh')
      const settled = new Promise<void>(resolve => {
        if (!bridge.isRunning.value) {
          resolve()

          return
        }

        const unwatch = watch(
          bridge.isRunning,
          running => {
            if (!running) {
              unwatch()
              resolve()
            }
          },
          { flush: 'sync' },
        )
      })

      if (!changedMedia) {
        assert.equal(sent[1]?.manifest.filename, initial.manifest.filename)
        assert.match(sent[1]?.manifest.inputs[0]?.urls[0] ?? '', /token=new/)
        await incoming.emit({
          version: 1,
          requestId: initial.requestId,
          type: 'completed',
          filename: '/Downloads/Bilibili/音频 M4A_Test.m4a',
          quality: 'AAC 128 kbps',
        })
      }

      await settled
      const [saved] = await sendDownloadMessage(
        { type: 'queue.list' },
        downloadJobsSchema,
      )

      assert.equal(saved?.status, changedMedia ? 'failed' : 'completed')
    },
  )
}
