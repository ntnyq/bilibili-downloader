import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import {
  fetchMediaBytes,
  MediaNetworkError,
} from '../../utils/downloads/media/fetchMediaBytes'

test('tries a backup CDN after HTTP failure and reports complete bytes', async context => {
  let attempts = 0
  context.mock.method(globalThis, 'fetch', async () =>
    ++attempts === 1
      ? new Response('', { status: 403 })
      : new Response(new Uint8Array([1, 2, 3])),
  )
  const progress: number[] = []
  const bytes = await fetchMediaBytes(
    ['https://primary.test', 'https://backup.test'],
    new AbortController().signal,
    10,
    size => progress.push(size),
  )
  assert.deepEqual([...bytes], [1, 2, 3])
  assert.equal(attempts, 2)
  assert.equal(progress.at(-1), 3)
})

test('enforces byte budget without Content-Length and does not retry oversized files', async context => {
  let attempts = 0
  context.mock.method(globalThis, 'fetch', async () => {
    attempts++
    return new Response(new Uint8Array(4))
  })
  await assert.rejects(
    fetchMediaBytes(
      ['https://one.test', 'https://two.test'],
      new AbortController().signal,
      3,
      () => {},
    ),
    RangeError,
  )
  assert.equal(attempts, 1)
})

test('cancellation stops before network access and truncated responses fail', async context => {
  const fetchMock = context.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(new Uint8Array(2), { headers: { 'content-length': '3' } }),
  )
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    fetchMediaBytes(['https://one.test'], controller.signal, 10, () => {}),
    { name: 'AbortError' },
  )
  assert.equal(fetchMock.mock.callCount(), 0)
  await assert.rejects(
    fetchMediaBytes(
      ['https://one.test'],
      new AbortController().signal,
      10,
      () => {},
    ),
    MediaNetworkError,
  )
})

test('gzip assets use decoded byte budgets instead of compressed Content-Length', async context => {
  const xml = Buffer.from(
    '<i><d>subtitle and danmaku content</d></i>'.repeat(100),
  )
  const small = Buffer.from('abc')
  const server = createServer((request, response) => {
    const body = gzipSync(request.url === '/small' ? small : xml)
    response.writeHead(200, {
      'Content-Encoding': 'gzip',
      'Content-Length': body.length,
    })
    response.end(body)
  })
  context.after(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    )
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}`
  const signal = new AbortController().signal
  const result = await fetchMediaBytes([url], signal, xml.length, () => {})
  assert.deepEqual(Buffer.from(result), xml)
  // A tiny decoded response may be smaller than its compressed wire payload.
  assert.deepEqual(
    Buffer.from(
      await fetchMediaBytes([`${url}/small`], signal, small.length, () => {}),
    ),
    small,
  )
  await assert.rejects(
    fetchMediaBytes([url], signal, xml.length - 1, () => {}),
    RangeError,
  )
})
