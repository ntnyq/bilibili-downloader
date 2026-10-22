import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { createMixinKey, signWbi } from '../../utils/bilibili/wbi'

test('derives the WBI mixin key from the two navigation images', () => {
  assert.equal(
    createMixinKey(
      'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
      'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
    ),
    'ea1db124af3c7062474693fa704f4ff8',
  )
  assert.throws(() =>
    createMixinKey(
      'https://example.com/invalid.png',
      'https://example.com/invalid.png',
    ),
  )
})

test('signs sorted, filtered, percent-encoded parameters without mutating inputs', () => {
  const input = { foo: "你 !'()*", bar: 514 }
  const expectedQuery = 'bar=514&foo=%E4%BD%A0%20&wts=1702204169'
  const digest = createHash('md5').update(`${expectedQuery}key`).digest('hex')
  assert.equal(
    signWbi(input, 'key', 1702204169),
    `${expectedQuery}&w_rid=${digest}`,
  )
  assert.equal(input.foo, "你 !'()*")
})
