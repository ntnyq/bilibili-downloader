import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MediaNetworkError } from './fetchMedia'
import { MEDIA_CACHE_CHUNK_BYTES, MediaCacheError } from './mediaCache'
import { fetchCachedMedia } from './resumableMedia'
import type { CachedMediaState, MediaCache } from './mediaCache'
import type { FetchCachedMediaOptions } from './resumableMedia'

const URL = 'https://cdn.test/video.m4s?signature=old'
const INPUT_KEY = 'video:cid:codec:bandwidth'

function createMemoryCache() {
  let state: CachedMediaState | undefined
  let chunks: Uint8Array<ArrayBuffer>[] = []
  const appended: number[] = []
  const cache: MediaCache = {
    read: async () => (state ? { ...state } : undefined),
    async reset(_key, representation) {
      state = {
        ...representation,
        received: 0,
        complete: false,
        updatedAt: Date.now(),
      }
      chunks = []
    },
    async append(_key, bytes) {
      assert.ok(state)
      assert.ok(bytes.byteLength <= MEDIA_CACHE_CHUNK_BYTES)
      chunks.push(bytes.slice())
      state.received += bytes.byteLength
      appended.push(bytes.byteLength)
    },
    async setTotal(_key, total) {
      assert.ok(state)
      state.total = total
    },
    async complete() {
      assert.ok(state)
      assert.ok(state.total === null || state.total === state.received)
      state.complete = true
      state.total = state.received
    },
    async blob() {
      assert.ok(state?.complete)
      return new Blob(chunks)
    },
    async clear() {
      state = undefined
      chunks = []
    },
    retain: async () => {},
  }
  return {
    cache,
    appended,
  }
}

async function seed(
  cache: MediaCache,
  {
    bytes = [1, 2],
    etag = '"v1"',
    total = 5,
    complete = false,
    url = URL,
  }: {
    bytes?: number[]
    etag?: string | null
    total?: number | null
    complete?: boolean
    url?: string
  } = {},
) {
  const parsed = new globalThis.URL(url)
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${parsed.origin}${parsed.pathname}`),
  )
  const resourceKey = Array.from(new Uint8Array(hash), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  await cache.reset(INPUT_KEY, { resourceKey, etag, total })
  await cache.append(INPUT_KEY, new Uint8Array(bytes))
  if (complete) {
    await cache.complete(INPUT_KEY)
  }
}

function download(
  cache: MediaCache,
  fetcher: typeof fetch,
  options: Partial<FetchCachedMediaOptions> = {},
) {
  return fetchCachedMedia({
    cache,
    inputKey: INPUT_KEY,
    urls: [URL],
    signal: new AbortController().signal,
    maxBytes: 10,
    onProgress: () => {},
    fetcher,
    ...options,
  })
}

async function bytes(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())]
}

test('persists an interrupted prefix and resumes with Range/If-Range after a signed URL refresh', async () => {
  const { cache } = createMemoryCache()
  await assert.rejects(
    download(
      cache,
      async () =>
        new Response(new Uint8Array([1, 2]), {
          headers: { 'content-length': '5', etag: '"v1"' },
        }),
    ),
    MediaNetworkError,
  )
  assert.equal((await cache.read(INPUT_KEY))?.received, 2)
  const result = await download(
    cache,
    async (_url, init) => {
      const headers = new Headers(init?.headers)
      assert.equal(headers.get('range'), 'bytes=2-')
      assert.equal(headers.get('if-range'), '"v1"')
      return new Response(new Uint8Array([3, 4, 5]), {
        status: 206,
        headers: {
          'content-range': 'bytes 2-4/5',
          'content-length': '3',
          etag: '"v1"',
        },
      })
    },
    { urls: ['https://cdn.test/video.m4s?signature=refreshed'] },
  )
  assert.deepEqual(await bytes(result), [1, 2, 3, 4, 5])
})

test('a full 200 response replaces the old prefix before consuming its bytes', async () => {
  const { cache } = createMemoryCache()
  await seed(cache)
  const result = await download(
    cache,
    async () =>
      new Response(new Uint8Array([8, 9]), {
        headers: { 'content-length': '2', etag: '"v2"' },
      }),
  )
  assert.deepEqual(await bytes(result), [8, 9])
  assert.equal((await cache.read(INPUT_KEY))?.etag, '"v2"')
})

test('mismatched validators, lengths, totals and ranges trigger one fresh request without concatenation', async () => {
  const invalidHeaders = [
    { etag: '"v2"' },
    { etag: 'W/"v1"' },
    { etag: '' },
    { 'content-range': 'bytes 1-3/5' },
    { 'content-range': 'bytes 2-5/6', 'content-length': '4' },
    { 'content-range': 'bytes 2-6/5' },
    { 'content-range': 'bytes 2-4/*' },
    { 'content-range': 'bytes 2-4/9007199254740992' },
    { 'content-length': '2' },
  ]
  for (const headers of invalidHeaders) {
    const { cache } = createMemoryCache()
    await seed(cache)
    let attempts = 0
    const result = await download(cache, async (_url, init) => {
      attempts++
      if (attempts === 1) {
        return new Response(new Uint8Array([3, 4, 5]), {
          status: 206,
          headers: new Headers({
            'content-range': 'bytes 2-4/5',
            'content-length': '3',
            etag: '"v1"',
            ...headers,
          }),
        })
      }
      assert.equal(new Headers(init?.headers).has('range'), false)
      return new Response(new Uint8Array([7, 8]), {
        headers: { 'content-length': '2', etag: '"v3"' },
      })
    })
    assert.equal(attempts, 2)
    assert.deepEqual(await bytes(result), [7, 8])
  }
})

test('missing validators and different CDN hosts/paths always start a new representation', async () => {
  for (const configuration of [
    { etag: null, url: URL },
    { etag: '"v1"', url: 'https://backup.test/video.m4s' },
    { etag: '"v1"', url: 'https://cdn.test/another.m4s' },
  ]) {
    const { cache } = createMemoryCache()
    await seed(cache, { etag: configuration.etag })
    const result = await download(
      cache,
      async (_url, init) => {
        assert.equal(new Headers(init?.headers).has('range'), false)
        return new Response(new Uint8Array([7, 8]), {
          headers: { etag: '"v1"' },
        })
      },
      { urls: [configuration.url] },
    )
    assert.deepEqual(await bytes(result), [7, 8])
  }
})

test('a weak ETag from a server never enables partial resume', async () => {
  const { cache } = createMemoryCache()
  await assert.rejects(
    download(
      cache,
      async () =>
        new Response(new Uint8Array([1, 2]), {
          headers: { 'content-length': '5', etag: 'W/"weak"' },
        }),
    ),
    MediaNetworkError,
  )
  assert.equal((await cache.read(INPUT_KEY))?.etag, null)
  await download(cache, async (_url, init) => {
    assert.equal(new Headers(init?.headers).has('range'), false)
    return new Response(new Uint8Array([3]))
  })
})

test('completed files are revalidated and unknown-length completion records its size', async () => {
  const { cache } = createMemoryCache()
  const initial = await download(
    cache,
    async () =>
      new Response(new Uint8Array([1, 2]), { headers: { etag: '"v1"' } }),
  )
  assert.equal(initial.size, 2)
  assert.equal((await cache.read(INPUT_KEY))?.total, 2)
  const reused = await download(cache, async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('if-none-match'), '"v1"')
    return new Response(null, { status: 304, headers: { etag: '"v1"' } })
  })
  assert.deepEqual(await bytes(reused), [1, 2])
  let attempts = 0
  const refreshed = await download(cache, async () => {
    attempts++
    return attempts === 1
      ? new Response(null, { status: 304 })
      : new Response(new Uint8Array([9]))
  })
  assert.equal(attempts, 2)
  assert.deepEqual(await bytes(refreshed), [9])
})

test('a valid 416 completes a full prefix and all other 416 recovery is bounded', async () => {
  const { cache } = createMemoryCache()
  await seed(cache, { total: 2 })
  const result = await download(
    cache,
    async () =>
      new Response(null, {
        status: 416,
        headers: { 'content-range': 'bytes */2', etag: '"v1"' },
      }),
  )
  assert.deepEqual(await bytes(result), [1, 2])
  await seed(cache)
  let attempts = 0
  await assert.rejects(
    download(cache, async () => {
      attempts++
      return new Response(null, {
        status: 416,
        headers: { 'content-range': 'bytes */1', etag: '"v2"' },
      })
    }),
    MediaNetworkError,
  )
  assert.equal(attempts, 2)
})

test('learns a missing total from 206 and safely continues capped ranges', async () => {
  const { cache } = createMemoryCache()
  await seed(cache, { total: null })
  let attempts = 0
  const result = await download(cache, async (_url, init) => {
    attempts++
    if (attempts === 1) {
      return new Response(new Uint8Array([3]), {
        status: 206,
        headers: { 'content-range': 'bytes 2-2/5', etag: '"v1"' },
      })
    }
    assert.equal((await cache.read(INPUT_KEY))?.total, 5)
    assert.equal(new Headers(init?.headers).get('range'), 'bytes=3-')
    return new Response(new Uint8Array([4, 5]), {
      status: 206,
      headers: { 'content-range': 'bytes 3-4/5', etag: '"v1"' },
    })
  })
  assert.equal(attempts, 2)
  assert.deepEqual(await bytes(result), [1, 2, 3, 4, 5])
})

test('shared input budget applies to cached totals, declared sizes, and streamed bytes', async () => {
  for (const headers of [
    new Headers(),
    new Headers({ 'content-length': '4' }),
  ]) {
    const { cache } = createMemoryCache()
    let attempts = 0
    await assert.rejects(
      download(
        cache,
        async () => {
          attempts++
          return new Response(new Uint8Array(4), { headers })
        },
        { maxBytes: 3, urls: [URL, 'https://backup.test/file'] },
      ),
      RangeError,
    )
    assert.equal(attempts, 1)
  }
  const { cache } = createMemoryCache()
  await seed(cache)
  await assert.rejects(
    download(cache, async () => assert.fail('No oversized request'), {
      maxBytes: 4,
    }),
    RangeError,
  )
})

test('abort flushes a small pending prefix and cancels the response body', async () => {
  const { cache } = createMemoryCache()
  const controller = new AbortController()
  let cancelled = false
  await assert.rejects(
    download(
      cache,
      async () =>
        new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(new Uint8Array([1, 2]))
            },
            cancel() {
              cancelled = true
            },
          }),
          { headers: { etag: '"v1"', 'content-length': '5' } },
        ),
      {
        signal: controller.signal,
        onProgress(received) {
          if (received === 2) {
            controller.abort()
          }
        },
      },
    ),
    { name: 'AbortError' },
  )
  assert.equal(cancelled, true)
  assert.equal((await cache.read(INPUT_KEY))?.received, 2)
  assert.equal((await cache.read(INPUT_KEY))?.complete, false)
})

test('large network buffers are split into bounded files and quota errors are not retried', async () => {
  const { cache, appended } = createMemoryCache()
  const size = MEDIA_CACHE_CHUNK_BYTES * 2 + 3
  const result = await download(
    cache,
    async () => new Response(new Uint8Array(size)),
    { maxBytes: size },
  )
  assert.equal(result.size, size)
  assert.deepEqual(appended, [
    MEDIA_CACHE_CHUNK_BYTES,
    MEDIA_CACHE_CHUNK_BYTES,
    3,
  ])
  let attempts = 0
  const failedCache: MediaCache = {
    ...createMemoryCache().cache,
    async append() {
      throw new MediaCacheError('空间不足')
    },
  }
  await assert.rejects(
    download(
      failedCache,
      async () => {
        attempts++
        return new Response(new Uint8Array([1]))
      },
      { urls: [URL, 'https://backup.test/file'] },
    ),
    MediaCacheError,
  )
  assert.equal(attempts, 1)
})

test('unsolicited, compressed, malformed and overlong responses never complete', async () => {
  for (const response of [
    new Response(new Uint8Array([1]), {
      status: 206,
      headers: { 'content-range': 'bytes 0-0/1' },
    }),
    new Response(new Uint8Array([1]), {
      headers: { 'content-encoding': 'gzip' },
    }),
    new Response(new Uint8Array([1]), {
      headers: { 'content-length': 'NaN' },
    }),
    new Response(new Uint8Array([1, 2]), {
      headers: { 'content-length': '1' },
    }),
  ]) {
    const { cache } = createMemoryCache()
    await assert.rejects(
      download(cache, async () => response),
      MediaNetworkError,
    )
    assert.notEqual((await cache.read(INPUT_KEY))?.complete, true)
  }
})

test('redirects cannot append a different resource even when its ETag matches', async () => {
  const { cache } = createMemoryCache()
  await seed(cache)
  let attempts = 0
  const result = await download(cache, async (_url, init) => {
    attempts++
    if (attempts === 1) {
      const response = new Response(new Uint8Array([3, 4, 5]), {
        status: 206,
        headers: { 'content-range': 'bytes 2-4/5', etag: '"v1"' },
      })
      Object.defineProperty(response, 'url', {
        value: 'https://backup.test/other.m4s',
      })
      return response
    }
    assert.equal(new Headers(init?.headers).has('range'), false)
    return new Response(new Uint8Array([9]))
  })
  assert.equal(attempts, 2)
  assert.deepEqual(await bytes(result), [9])
})

test('invalid and unavailable primary URLs still allow safe fallback downloads', async () => {
  const { cache } = createMemoryCache()
  await seed(cache)
  let attempts = 0
  const result = await download(
    cache,
    async (_url, init) => {
      attempts++
      if (attempts === 1) {
        return new Response(null, { status: 403 })
      }
      assert.equal(new Headers(init?.headers).has('range'), false)
      return new Response(new Uint8Array([9]), { headers: { etag: '"v1"' } })
    },
    { urls: ['not-a-url', URL, 'https://backup.test/video.m4s'] },
  )
  assert.equal(attempts, 2)
  assert.deepEqual(await bytes(result), [9])
})
