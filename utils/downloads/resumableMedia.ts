import { MediaNetworkError } from './fetchMedia'
import {
  MEDIA_CACHE_CHUNK_BYTES,
  MediaCacheError,
  parseStrongETag,
} from './mediaCache'
import type { CachedMediaState, MediaCache } from './mediaCache'

const MAX_REQUESTS_PER_URL = 32

export interface FetchCachedMediaOptions {
  cache: MediaCache
  inputKey: string
  urls: string[]
  signal: AbortSignal
  maxBytes: number
  onProgress: (received: number) => void
  fetcher?: typeof fetch
}

interface MediaRange {
  start: number
  end: number
  total: number
}

function parseSize(value: string | null): number | null {
  if (value === null) {
    return null
  }
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new MediaNetworkError('素材服务器返回了无效的文件大小。')
  }
  const size = Number(value)
  if (!Number.isSafeInteger(size)) {
    throw new MediaNetworkError('素材服务器返回了无效的文件大小。')
  }
  return size
}

function parseRange(value: string | null): MediaRange {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/u)
  const start = parseSize(match?.[1] ?? null)
  const end = parseSize(match?.[2] ?? null)
  const total = parseSize(match?.[3] ?? null)
  if (
    start === null
    || end === null
    || total === null
    || start > end
    || end >= total
  ) {
    throw new MediaNetworkError('素材服务器返回了无效的续传范围。')
  }
  return {
    start,
    end,
    total,
  }
}

async function resourceKey(url: string): Promise<string> {
  const parsed = new URL(url)
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new MediaNetworkError('素材地址协议无效。')
  }
  // ETags are scoped to a resource. A different CDN host or media path must
  // start afresh even when an unrelated resource happens to share its ETag.
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${parsed.origin}${parsed.pathname}`),
  )
  return Array.from(new Uint8Array(hash), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function enforceBudget(received: number, maxBytes: number) {
  if (received > maxBytes) {
    throw new RangeError('素材超过剩余大小限制，已停止下载。')
  }
}

/**
 * Streams into bounded, immutable disk chunks. Interrupted transfers retain
 * their committed prefix; only a strong validator permits appending to it.
 */
export async function fetchCachedMedia({
  cache,
  inputKey,
  urls,
  signal,
  maxBytes,
  onProgress,
  fetcher = fetch,
}: FetchCachedMediaOptions): Promise<Blob> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError('素材超过剩余大小限制，已停止下载。')
  }
  let lastError: unknown
  for (const url of urls) {
    signal.throwIfAborted()
    let sourceKey: string
    try {
      sourceKey = await resourceKey(url)
    } catch (error) {
      lastError = error
      continue
    }
    let hasRecovered = false
    for (let attempt = 0; attempt < MAX_REQUESTS_PER_URL; attempt++) {
      signal.throwIfAborted()
      const previous = await cache.read(inputKey)
      const reusable =
        previous
        && previous.received > 0
        && previous.resourceKey === sourceKey
        && previous.etag
          ? previous
          : undefined
      if (reusable) {
        enforceBudget(reusable.received, maxBytes)
        if (reusable.total !== null) {
          enforceBudget(reusable.total, maxBytes)
        }
      }
      const headers = new Headers()
      if (reusable?.complete) {
        headers.set('If-None-Match', reusable.etag ?? '')
      } else if (reusable) {
        headers.set('Range', `bytes=${reusable.received}-`)
        headers.set('If-Range', reusable.etag ?? '')
      }
      const controller = new AbortController()
      let timeout: ReturnType<typeof setTimeout> | undefined
      let reader:
        | ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>
        | undefined
      let responseBody: ReadableStream<Uint8Array<ArrayBuffer>> | null = null
      let pending = new Uint8Array(MEDIA_CACHE_CHUNK_BYTES)
      let pendingBytes = 0
      let canPreservePending = false
      const flush = async () => {
        if (pendingBytes) {
          const bytes = pending.slice(0, pendingBytes)
          pendingBytes = 0
          await cache.append(inputKey, bytes)
        }
      }
      const resetTimeout = () => {
        clearTimeout(timeout)
        timeout = setTimeout(
          () => controller.abort(new Error('下载连接超时。')),
          30000,
        )
      }
      const recover = async () => {
        if (hasRecovered) {
          throw new MediaNetworkError('素材服务器无法安全恢复断点下载。')
        }
        hasRecovered = true
        await cache.reset(inputKey, {
          resourceKey: sourceKey,
          etag: null,
          total: null,
        })
      }
      try {
        onProgress(reusable?.received ?? 0)
        resetTimeout()
        const response = await fetcher(url, {
          credentials: 'omit',
          cache: 'no-store',
          headers,
          signal: AbortSignal.any([signal, controller.signal]),
        })
        responseBody = response.body
        const responseKey = response.url
          ? await resourceKey(response.url)
          : sourceKey
        const etag = parseStrongETag(response.headers.get('etag'))
        if (response.status === 304 && reusable?.complete) {
          if (etag !== reusable.etag || responseKey !== sourceKey) {
            await recover()
            continue
          }
          return await cache.blob(inputKey)
        }
        if (response.status === 416 && reusable && !reusable.complete) {
          const match = response.headers
            .get('content-range')
            ?.match(/^bytes \*\/(\d+)$/u)
          const total = parseSize(match?.[1] ?? null)
          if (
            etag === reusable.etag
            && responseKey === sourceKey
            && total !== null
            && total === reusable.total
            && total === reusable.received
          ) {
            await cache.complete(inputKey)
            return await cache.blob(inputKey)
          }
          await recover()
          continue
        }
        if (
          ![200, 206].includes(response.status)
          || !response.body
          || /^multipart\/byteranges/iu.test(
            response.headers.get('content-type') ?? '',
          )
          || !['', 'identity'].includes(
            response.headers.get('content-encoding')?.toLowerCase() ?? '',
          )
        ) {
          throw new MediaNetworkError(
            `素材服务器返回无法下载的响应（HTTP ${response.status}）。`,
          )
        }
        const length = parseSize(response.headers.get('content-length'))
        let state: Pick<CachedMediaState, 'received' | 'total'>
        let responseBytes: number | null = length
        if (response.status === 206) {
          if (!reusable || reusable.complete) {
            throw new MediaNetworkError('素材服务器返回了意外的部分响应。')
          }
          let range: MediaRange
          try {
            range = parseRange(response.headers.get('content-range'))
          } catch (error) {
            await recover()
            lastError = error
            continue
          }
          responseBytes = range.end - range.start + 1
          if (
            etag !== reusable.etag
            || responseKey !== sourceKey
            || range.start !== reusable.received
            || (reusable.total !== null && range.total !== reusable.total)
            || (length !== null && length !== responseBytes)
          ) {
            await recover()
            continue
          }
          enforceBudget(range.total, maxBytes)
          if (reusable.total === null) {
            await cache.setTotal(inputKey, range.total)
          }
          state = { received: reusable.received, total: range.total }
        } else {
          if (response.headers.has('content-range')) {
            throw new MediaNetworkError('素材服务器返回了不一致的文件范围。')
          }
          if (length !== null) {
            enforceBudget(length, maxBytes)
          }
          if (length === 0) {
            throw new MediaNetworkError('素材服务器返回了空文件。')
          }
          // A 200 response ignored Range or describes a new representation.
          // Delete the old prefix before consuming any bytes from this body.
          await cache.reset(inputKey, {
            resourceKey: responseKey,
            etag,
            total: length,
          })
          onProgress(0)
          state = { received: 0, total: length }
        }
        reader = response.body.getReader()
        canPreservePending = true
        let transferred = 0
        let received = state.received
        while (true) {
          signal.throwIfAborted()
          const { done, value } = await reader.read()
          if (done) {
            break
          }
          enforceBudget(received + value.byteLength, maxBytes)
          if (
            responseBytes !== null
            && transferred + value.byteLength > responseBytes
          ) {
            throw new MediaNetworkError('素材响应大小超过声明的范围。')
          }
          transferred += value.byteLength
          received += value.byteLength
          for (let offset = 0; offset < value.byteLength;) {
            const size = Math.min(
              MEDIA_CACHE_CHUNK_BYTES - pendingBytes,
              value.byteLength - offset,
            )
            pending.set(value.subarray(offset, offset + size), pendingBytes)
            pendingBytes += size
            offset += size
            if (pendingBytes === MEDIA_CACHE_CHUNK_BYTES) {
              await flush()
              pending = new Uint8Array(MEDIA_CACHE_CHUNK_BYTES)
            }
          }
          onProgress(received)
          resetTimeout()
        }
        await flush()
        signal.throwIfAborted()
        if (
          !transferred
          || (responseBytes !== null && transferred !== responseBytes)
        ) {
          throw new MediaNetworkError('素材传输不完整，已保留下载缓存。')
        }
        if (state.total !== null && received < state.total) {
          // Some servers cap individual range responses. The next request must
          // make progress and is subject to the same validator and size checks.
          continue
        }
        await cache.complete(inputKey)
        return await cache.blob(inputKey)
      } catch (error) {
        if (canPreservePending && !(error instanceof MediaCacheError)) {
          await flush()
        }
        signal.throwIfAborted()
        if (error instanceof RangeError || error instanceof MediaCacheError) {
          throw error
        }
        lastError = error
        break
      } finally {
        clearTimeout(timeout)
        controller.abort()
        // Reader cancellation releases the connection after invalid framing,
        // budget failures, and user cancellation; the committed cache remains.
        if (reader) {
          await reader.cancel().catch(() => {})
        } else {
          await responseBody?.cancel().catch(() => {})
        }
      }
    }
  }
  throw new MediaNetworkError('所有素材线路均下载失败，已保留下载缓存。', {
    cause: lastError,
  })
}
