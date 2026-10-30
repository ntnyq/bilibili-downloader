import { i18n } from '~/utils/i18n'

export class MediaNetworkError extends Error {
  override name = 'MediaNetworkError'
}

/**
 * Enforce the shared input budget even when the CDN omits Content-Length.
 *
 * @param urls - Primary and backup media URLs attempted in order without
 * sending credentials.
 * @param signal - Caller cancellation signal, combined with a 30-second
 * inactivity timeout per attempt.
 * @param remainingBytes - Maximum decoded byte count permitted for this input.
 * @param onProgress - Callback receiving the current attempt byte count; reset
 * to zero before each URL.
 * @returns A promise resolving to the complete input as one contiguous byte
 * array in memory.
 * @throws {RangeError} If declared uncompressed size or decoded streamed bytes
 *   exceed the budget.
 * @throws {MediaNetworkError} If all URLs fail, time out, or return
 *   empty/truncated media.
 * @throws The caller signal abort reason when cancelled.
 */
export async function fetchMediaBytes(
  urls: string[],
  signal: AbortSignal,
  remainingBytes: number,
  onProgress: (received: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  let lastError: unknown
  for (const url of urls) {
    signal.throwIfAborted()
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
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
    try {
      onProgress(0)
      resetTimeout()
      const response = await fetch(url, {
        credentials: 'omit',
        signal: AbortSignal.any([signal, controller.signal]),
      })
      if (!response.ok || !response.body) {
        throw new MediaNetworkError(
          i18n.t('fetchMediaBytes.theMediaServerReturnedHttp', [
            response.status,
          ]),
        )
      }
      // Fetch decodes compressed bodies; Content-Length describes wire bytes.
      const encoding = response.headers
        .get('content-encoding')
        ?.trim()
        .toLowerCase()
      const declaredBytes =
        !encoding || encoding === 'identity'
          ? Number(response.headers.get('content-length')) || 0
          : 0
      if (declaredBytes > remainingBytes) {
        throw new RangeError(
          i18n.t('fetchMediaBytes.theAssetExceedsTheRemainingMbSizeLimit', [
            Math.floor(remainingBytes / 1024 / 1024),
          ]),
        )
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array<ArrayBuffer>[] = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        received += value.byteLength
        if (received > remainingBytes) {
          throw new RangeError(
            i18n.t(
              'fetchCachedMedia.theAssetExceedsTheRemainingSizeLimitDownload',
            ),
          )
        }
        chunks.push(value)
        onProgress(received)
        resetTimeout()
      }
      if (!received || (declaredBytes > 0 && received !== declaredBytes)) {
        throw new MediaNetworkError(
          i18n.t('fetchMediaBytes.mediaTransferIncomplete'),
        )
      }
      const bytes = new Uint8Array(received)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.length
      }
      return bytes
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof RangeError) {
        throw error
      }
      lastError = error
    } finally {
      clearTimeout(timeout)
      controller.abort()
    }
  }
  throw new MediaNetworkError(
    i18n.t('fetchMediaBytes.allMediaSourcesFailedPleaseTryAgainLater'),
    {
      cause: lastError,
    },
  )
}
