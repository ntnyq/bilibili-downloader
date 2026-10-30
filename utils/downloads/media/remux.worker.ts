import { i18n, initializeWorkerI18n } from '~/utils/i18n'
import { createOpfsFragmentIndex } from './fragments/fragmentIndex'
import { createOpfsFragmentSamples } from './fragments/fragmentSamples'
import { mergeProgressiveMedia } from './progressiveMedia'
import { remuxMedia } from './remuxMedia'
import type { StreamTargetChunk } from 'mediabunny'
import type { RemuxKind } from './remuxMedia'

export interface RemuxRequest {
  messages: Record<string, string>
  kind: RemuxKind
  inputs: Blob[]
  handle: FileSystemFileHandle
  directory: FileSystemDirectoryHandle
}

export type RemuxResponse =
  | { type: 'ready' }
  | { type: 'progress'; bytes: number }
  | { type: 'complete' }
  | { type: 'error'; name: string; message: string }

self.addEventListener(
  'message',
  async ({ data }: MessageEvent<RemuxRequest>) => {
    initializeWorkerI18n(data.messages)
    let writer: FileSystemWritableFileStream | undefined
    let index: ReturnType<typeof createOpfsFragmentIndex> | undefined
    let samples: ReturnType<typeof createOpfsFragmentSamples> | undefined
    const post = (message: RemuxResponse) => self.postMessage(message)
    // Acknowledge startup before parsing indexes or entering synchronous WASM.
    // Neither phase guarantees packet progress or an available event loop.
    post({ type: 'ready' })
    try {
      let lastProgressAt = 0
      const onProgress = (bytes: number) => {
        if (Date.now() - lastProgressAt >= 500) {
          lastProgressAt = Date.now()
          post({ type: 'progress', bytes })
        }
      }
      if (data.kind === 'progressive') {
        await mergeProgressiveMedia(data.inputs, data.handle, onProgress)
        post({ type: 'complete' })
        return
      }
      writer = await data.handle.createWritable()
      index = createOpfsFragmentIndex(data.directory)
      samples = createOpfsFragmentSamples(data.directory)
      const fileWriter = writer
      const writable = new WritableStream<StreamTargetChunk>({
        write: chunk => fileWriter.write(chunk),
        close: () => fileWriter.close(),
        abort: () => fileWriter.abort(),
      })
      await remuxMedia(
        data.kind,
        data.inputs,
        writable,
        new AbortController().signal,
        index,
        samples,
        onProgress,
      )
      await samples.dispose()
      await index.dispose()
      post({ type: 'complete' })
    } catch (error) {
      await samples?.dispose().catch(() => {})
      await index?.dispose().catch(() => {})
      await writer?.abort().catch(() => {})
      post({
        type: 'error',
        name: error instanceof Error ? error.name : 'Error',
        message:
          error instanceof Error
            ? error.message
            : i18n.t('remuxWorker.browserMediaRemuxingFailed'),
      })
    }
  },
)
