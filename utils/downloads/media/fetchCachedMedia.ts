import { i18n } from '~/utils/i18n'
import { MediaNetworkError } from './fetchMediaBytes'
import {
  MEDIA_CACHE_CHUNK_BYTES,
  MediaCacheError,
  parseStrongETag,
} from './mediaCache'
import type { CachedMediaState, MediaCache } from './mediaCache'
import type { MediaStorageState } from './storageBudget'

export interface FetchCachedMediaOptions {
  cache: MediaCache
  inputKey: string
  urls: string[]
  signal: AbortSignal
  maxBytes: number
  onProgress: (received: number) => void
  fetcher?: typeof fetch
  checkStorage?: (state: MediaStorageState) => Promise<void>
}

interface MediaRange {
  start: number
  end: number
  total: number
}

/**
 * Parses a strict nonnegative decimal byte count from an HTTP header
 * component.
 *
 * @param value - Header value or range component, or null when absent.
 * @returns A nonnegative safe integer, or null when no value was supplied.
 * @throws {MediaNetworkError} If the value is not canonical decimal syntax or
 *   exceeds safe integer precision.
 */
function parseByteCount(value: string | null): number | null {
  if (value === null) {
    return null
  }
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new MediaNetworkError(
      i18n.t('fetchCachedMedia.theMediaServerReturnedAnInvalidFileSize'),
    )
  }
  const size = Number(value)
  if (!Number.isSafeInteger(size)) {
    throw new MediaNetworkError(
      i18n.t('fetchCachedMedia.theMediaServerReturnedAnInvalidFileSize'),
    )
  }
  return size
}

/**
 * Parses and validates a single finite HTTP bytes range.
 *
 * @param value - Content-Range header in the form bytes start-end/total.
 * @returns Inclusive start/end offsets and the complete representation length.
 * @throws {MediaNetworkError} If the header is absent, malformed, unsafe,
 *   reversed, or extends beyond total.
 */
function parseContentRange(value: string | null): MediaRange {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/u)
  const start = parseByteCount(match?.[1] ?? null)
  const end = parseByteCount(match?.[2] ?? null)
  const total = parseByteCount(match?.[3] ?? null)
  if (
    start === null
    || end === null
    || total === null
    || start > end
    || end >= total
  ) {
    throw new MediaNetworkError(
      i18n.t('fetchCachedMedia.theMediaServerReturnedAnInvalidResumeRange'),
    )
  }
  return {
    start,
    end,
    total,
  }
}

/**
 * Hashes a media origin and path so validators cannot be reused across
 * different resources.
 *
 * @param url - Absolute HTTP(S) media URL; expiring query parameters are
 * excluded from identity.
 * @returns A promise resolving to the lowercase hexadecimal SHA-256 resource
 * key.
 * @throws {TypeError} If the URL is malformed.
 * @throws {MediaNetworkError} If the URL protocol is not HTTP or HTTPS.
 * @throws The Web Crypto error if hashing cannot complete.
 */
async function createMediaResourceKey(url: string): Promise<string> {
  const parsed = new URL(url)
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new MediaNetworkError(
      i18n.t('fetchCachedMedia.invalidMediaUrlProtocol'),
    )
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

/**
 * Checks a received or declared media size against the remaining byte budget.
 *
 * Returns no value when the size is within the budget.
 *
 * @param received - Cached, declared, or newly received byte count to check.
 * @param maxBytes - Maximum bytes available to this media input.
 * @throws {RangeError} If received exceeds maxBytes.
 */
function assertMediaSizeLimit(received: number, maxBytes: number) {
  if (received > maxBytes) {
    throw new RangeError(
      i18n.t('fetchCachedMedia.theAssetExceedsTheRemainingSizeLimitDownload'),
    )
  }
}

/**
 * Streams into bounded, immutable disk chunks. Interrupted transfers retain
 * their committed prefix; only a strong validator permits appending to it.
 *
 * @param options - Media transfer, resumable-cache, cancellation, and
 * storage-check configuration.
 * @param options.cache - Job-scoped media cache; the caller must hold the
 * media-cache lock.
 * @param options.inputKey - Stable track/fragment identity used to find the
 * cached representation.
 * @param options.urls - Primary and backup media URLs tried in order.
 * @param options.signal - Cancellation signal; a safely received prefix is
 * retained when possible.
 * @param options.maxBytes - Positive safe-integer byte ceiling shared with
 * other media inputs.
 * @param options.onProgress - Callback reporting the current input byte count,
 * including a reused prefix.
 * @param options.fetcher - Optional fetch implementation; defaults to the
 * global fetch function.
 * @param options.checkStorage - Optional async quota check before reusing
 * complete data, consuming a declared body, or committing buffered bytes.
 * @returns A promise resolving to the complete disk-backed cached Blob after
 * validator and framing checks.
 * @throws {RangeError} If maxBytes is invalid, a cached/declared/received size
 *   exceeds it, or storage checks reject capacity.
 * @throws {MediaCacheError} If cache contents are missing, invalid, or cannot
 *   be read or committed.
 * @throws {MediaNetworkError} If every URL fails or no response can be safely
 *   completed.
 * @throws The signal abort reason when cancelled; storage-hook failures may
 *   also propagate during pending-prefix preservation.
 */
export async function fetchCachedMedia({
  cache,
  inputKey,
  urls,
  signal,
  maxBytes,
  onProgress,
  fetcher = fetch,
  checkStorage,
}: FetchCachedMediaOptions): Promise<Blob> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError(
      i18n.t('fetchCachedMedia.theAssetExceedsTheRemainingSizeLimitDownload'),
    )
  }
  let lastError: unknown
  for (const url of urls) {
    signal.throwIfAborted()
    let sourceKey: string
    try {
      sourceKey = await createMediaResourceKey(url)
    } catch (error) {
      lastError = error
      continue
    }
    let hasRecovered = false
    while (true) {
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
        assertMediaSizeLimit(reusable.received, maxBytes)
        if (reusable.total !== null) {
          assertMediaSizeLimit(reusable.total, maxBytes)
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
          if (checkStorage) {
            const state = await cache.read(inputKey)
            if (!state) {
              throw new MediaCacheError(
                i18n.t('fetchCachedMedia.downloadCacheWasLostDownloadAgain'),
              )
            }
            await checkStorage({
              received: state.received,
              total: state.total,
              additionalBytes: pendingBytes,
            })
          }
          const bytes = pending.slice(0, pendingBytes)
          pendingBytes = 0
          await cache.append(inputKey, bytes)
        }
      }
      const resetTimeout = () => {
        clearTimeout(timeout)
        timeout = setTimeout(
          () =>
            controller.abort(
              new Error(i18n.t('fetchCachedMedia.downloadConnectionTimedOut')),
            ),
          30000,
        )
      }
      const recover = async () => {
        if (hasRecovered) {
          throw new MediaNetworkError(
            i18n.t(
              'fetchCachedMedia.theMediaServerCannotSafelyResumeThisDownload',
            ),
          )
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
          ? await createMediaResourceKey(response.url)
          : sourceKey
        const etag = parseStrongETag(response.headers.get('etag'))
        if (response.status === 304 && reusable?.complete) {
          if (etag !== reusable.etag || responseKey !== sourceKey) {
            await recover()
            continue
          }
          await checkStorage?.({
            received: reusable.received,
            total: reusable.total,
            additionalBytes: 0,
          })
          return await cache.blob(inputKey)
        }
        if (response.status === 416 && reusable && !reusable.complete) {
          const match = response.headers
            .get('content-range')
            ?.match(/^bytes \*\/(\d+)$/u)
          const total = parseByteCount(match?.[1] ?? null)
          if (
            etag === reusable.etag
            && responseKey === sourceKey
            && total !== null
            && total === reusable.total
            && total === reusable.received
          ) {
            await checkStorage?.({
              received: reusable.received,
              total,
              additionalBytes: 0,
            })
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
            i18n.t(
              'fetchCachedMedia.theMediaServerReturnedAnUndownloadableResponseHttp',
              [response.status],
            ),
          )
        }
        const length = parseByteCount(response.headers.get('content-length'))
        let state: Pick<CachedMediaState, 'received' | 'total'>
        let responseBytes: number | null = length
        if (response.status === 206) {
          if (!reusable || reusable.complete) {
            throw new MediaNetworkError(
              i18n.t(
                'fetchCachedMedia.theMediaServerReturnedAnUnexpectedPartialResponse',
              ),
            )
          }
          let range: MediaRange
          try {
            range = parseContentRange(response.headers.get('content-range'))
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
          assertMediaSizeLimit(range.total, maxBytes)
          if (reusable.total === null) {
            await cache.setTotal(inputKey, range.total)
          }
          state = { received: reusable.received, total: range.total }
        } else {
          if (response.headers.has('content-range')) {
            throw new MediaNetworkError(
              i18n.t(
                'fetchCachedMedia.theMediaServerReturnedAnInconsistentFileRange',
              ),
            )
          }
          if (length !== null) {
            assertMediaSizeLimit(length, maxBytes)
          }
          if (length === 0) {
            throw new MediaNetworkError(
              i18n.t('fetchCachedMedia.theMediaServerReturnedAnEmptyFile'),
            )
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
        await checkStorage?.({ ...state, additionalBytes: 0 })
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
          assertMediaSizeLimit(received + value.byteLength, maxBytes)
          if (
            responseBytes !== null
            && transferred + value.byteLength > responseBytes
          ) {
            throw new MediaNetworkError(
              i18n.t('fetchCachedMedia.theMediaResponseExceedsItsDeclaredSize'),
            )
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
          throw new MediaNetworkError(
            i18n.t(
              'fetchCachedMedia.mediaTransferIncompleteDownloadCacheRetained',
            ),
          )
        }
        if (state.total !== null && received < state.total) {
          // Valid ranges strictly advance toward a stable, finite total. Only
          // representation recovery is bounded; progress must not spend retries.
          continue
        }
        await cache.complete(inputKey)
        return await cache.blob(inputKey)
      } catch (error) {
        if (
          canPreservePending
          && !(error instanceof MediaCacheError)
          && !(error instanceof RangeError)
        ) {
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
  throw new MediaNetworkError(
    i18n.t('fetchCachedMedia.allMediaSourcesFailedDownloadCacheRetained'),
    {
      cause: lastError,
    },
  )
}
