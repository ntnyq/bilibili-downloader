import { MEDIA_CACHE_DIRECTORY } from './mediaCache'
import { assertMediaOutputSpace } from './storageBudget'
import type { RemuxRequest, RemuxResponse } from './remux.worker'
import type { RemuxKind } from './remuxMedia'

export interface BrowserMediaOutput {
  blob: Blob
  dispose: () => Promise<void>
}

/**
 * Called under the runner's media-cache lock. Keeps the OPFS file alive until
 * the browser download reaches a terminal state, including cancellation.
 */
export async function mergeBrowserMedia(
  kind: RemuxKind,
  inputs: Blob[],
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
): Promise<BrowserMediaOutput> {
  signal.throwIfAborted()
  const bytes = inputs.reduce((sum, input) => sum + input.size, 0)
  await assertMediaOutputSpace(bytes)
  const storage = await navigator.storage.getDirectory()
  const cache = await storage.getDirectoryHandle(MEDIA_CACHE_DIRECTORY, {
    create: true,
  })
  // Non-job directories are also pruned after a page crash by pruneMediaCache.
  const directory = await cache.getDirectoryHandle('merged-output', {
    create: true,
  })
  const filename = `${crypto.randomUUID()}.${kind === 'audio' ? 'm4a' : 'mp4'}`
  const dispose = () => directory.removeEntry(filename)
  const handle = await directory.getFileHandle(filename, { create: true })
  let worker: Worker | undefined
  try {
    signal.throwIfAborted()
    const remuxWorker = new Worker(
      new URL('./remux.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    )
    worker = remuxWorker
    await new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>
      const abort = () => {
        clearTimeout(timeout)
        remuxWorker.terminate()
        reject(signal.reason)
      }
      const cleanup = () => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
      }
      // Startup is bounded, but an acknowledged job may spend arbitrarily long
      // in index parsing/finalization or synchronous WASM. Byte progress cannot
      // distinguish that work from a hang. Explicit cancellation stays available.
      timeout = setTimeout(() => {
        cleanup()
        reject(new Error('浏览器封装 Worker 启动超时，请重试。'))
      }, 120000)
      signal.addEventListener('abort', abort, { once: true })
      remuxWorker.addEventListener('error', event => {
        cleanup()
        reject(new Error(event.message || '浏览器封装 Worker 启动失败。'))
      })
      remuxWorker.addEventListener(
        'message',
        ({ data }: MessageEvent<RemuxResponse>) => {
          clearTimeout(timeout)
          if (data.type === 'ready') {
            return
          }
          if (data.type === 'progress') {
            onProgress(data.bytes)
            return
          }
          cleanup()
          if (data.type === 'complete') {
            resolve()
          } else {
            reject(
              new Error(
                data.name === 'QuotaExceededError'
                  ? '浏览器本地缓存空间不足，请清理下载缓存或释放磁盘空间后重试。'
                  : data.message,
              ),
            )
          }
        },
      )
      remuxWorker.addEventListener('messageerror', () => {
        cleanup()
        reject(new Error('浏览器无法接收音视频封装结果。'))
      })
      try {
        remuxWorker.postMessage({ kind, inputs, handle } satisfies RemuxRequest)
      } catch (error) {
        cleanup()
        reject(error)
      }
    })
    signal.throwIfAborted()
    const blob = await handle.getFile()
    if (!blob.size) {
      throw new Error('浏览器封装结果为空。')
    }
    return {
      // Set the media MIME without reading/copying the disk-backed file. A
      // generic OPFS MIME can make Chromium replace the requested extension.
      blob: blob.slice(
        0,
        blob.size,
        kind === 'audio' ? 'audio/x-m4a' : 'video/mp4',
      ),
      dispose,
    }
  } catch (error) {
    worker?.terminate()
    await dispose().catch(console.warn)
    throw error
  } finally {
    worker?.terminate()
  }
}
