import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BilibiliApiError,
  getVideoInfo,
  requestApi,
} from '../../utils/bilibili/api'

test('API rejections without data retain login and risk-control information', async () => {
  const originalFetch = fetch
  try {
    for (const code of [-101, -352, -412, -401, -403, 799]) {
      globalThis.fetch = async () =>
        Response.json({ code, message: '请求被拒绝' })
      await assert.rejects(requestApi('/test'), error => {
        assert.ok(error instanceof BilibiliApiError)
        assert.equal(error.code, code)
        assert.equal(error.shouldStopBatch, true)
        if (code === -101) {
          assert.match(error.message, /登录/)
        }
        return true
      })
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('unavailable videos may be skipped, but HTTP throttling stops imports', async () => {
  const originalFetch = fetch
  try {
    globalThis.fetch = async () =>
      Response.json({ code: -404, message: '视频不存在' })
    await assert.rejects(requestApi('/test'), error => {
      assert.ok(error instanceof BilibiliApiError)
      assert.equal(error.shouldStopBatch, false)
      return true
    })
    globalThis.fetch = async () => new Response('', { status: 429 })
    await assert.rejects(requestApi('/test'), error => {
      assert.ok(error instanceof BilibiliApiError)
      assert.equal(error.code, 429)
      assert.equal(error.shouldStopBatch, true)
      return true
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('video metadata uses the caller abort signal and existing browser session', async () => {
  const originalFetch = fetch
  const controller = new AbortController()
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(
        String(input),
        'https://api.bilibili.com/x/web-interface/view?aid=170001',
      )
      assert.equal(init?.credentials, 'include')
      assert.ok(init?.signal)
      controller.abort()
      assert.equal(init.signal.aborted, true)
      init.signal.throwIfAborted()
      throw new Error('An aborted request must not complete')
    }
    await assert.rejects(getVideoInfo('av170001', controller.signal), {
      name: 'AbortError',
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('a non-JSON API response stops a batch instead of failing every video in turn', async () => {
  const originalFetch = fetch
  try {
    globalThis.fetch = async () => new Response('<html>blocked</html>')
    await assert.rejects(requestApi('/test'), error => {
      assert.ok(error instanceof BilibiliApiError)
      assert.equal(error.shouldStopBatch, true)
      assert.ok(error.cause instanceof SyntaxError)
      return true
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
