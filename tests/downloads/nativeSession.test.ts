import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computed, readonly, shallowRef, watch } from 'vue'
import { browser } from 'wxt/browser'
import { downloadJobSchema, downloadJobsSchema } from '../../types/download'
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
const { sendDownloadMessage } = await import('../../utils/downloads/messages')

for (const changedMedia of [false, true]) {
  test(
    changedMedia
      ? 'native refresh still rejects a changed representation'
      : 'native refresh freezes the output path across language changes',
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

          if (message.type === 'cancel') {
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

      await bridge.start()
      const initial = sent[0]

      assert.ok(initial)
      assert.equal(initial.manifest.filename, 'Bilibili/音频 M4A_Test.m4a')
      await incoming.emit({
        version: 1,
        requestId: initial.requestId,
        type: 'started',
      })
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
