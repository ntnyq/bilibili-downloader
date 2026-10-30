import assert from 'node:assert/strict'
import { readdir, stat } from 'node:fs/promises'
import { test } from 'node:test'
import { createDiskFragmentMedia } from '../../utils/downloads/media/fragments/fragmentMedia'
import { temporaryFragmentIndex } from '../fixtures/downloads/fragmentIndex'

test('reuses truncated media files across fragments and keeps tracks independent', async () => {
  const media = await temporaryFragmentIndex('media')
  try {
    await media.store.append(2, Uint8Array.of(2, 4, 6))
    for (let fragment = 0; fragment < 40; fragment++) {
      const bytes = new Uint8Array(fragment === 0 ? 131099 : 17).fill(fragment)
      await media.store.append(1, bytes)
      for (let offset = 0; offset < bytes.length; offset += 65536) {
        const length = Math.min(65536, bytes.length - offset)
        assert.deepEqual(
          await media.store.read(1, offset, length),
          bytes.subarray(offset, offset + length),
        )
      }
      assert.equal(
        (await stat(`${media.directory}/media-1.tmp`)).size,
        bytes.length,
      )
      await media.store.reset(1)
    }
    assert.deepEqual(await media.store.read(2, 0, 3), Uint8Array.of(2, 4, 6))
    assert.equal((await readdir(media.directory)).length, 2)
  } finally {
    await media.dispose()
  }
  await assert.rejects(stat(media.directory), { code: 'ENOENT' })
})

test('queues reset behind an active read before reopening the next fragment', async () => {
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  let opens = 0
  let closes = 0
  const store = createDiskFragmentMedia(async () => {
    opens++
    let bytes = new Uint8Array(0)
    return {
      async write(data) {
        bytes = data.slice()
        return data.length
      },
      async read(data) {
        if (opens === 1) {
          entered.resolve()
          await gate.promise
        }
        data.set(bytes)
        return data.length
      },
      async seal() {},
      async close() {
        closes++
      },
    }
  })
  await store.append(1, Uint8Array.of(7, 8))
  const reading = store.read(1, 0, 2)
  await entered.promise
  const reset = store.reset(1)
  const append = store.append(1, Uint8Array.of(9))
  assert.equal(opens, 1)
  assert.equal(closes, 0)
  gate.resolve()
  assert.deepEqual(await reading, Uint8Array.of(7, 8))
  await reset
  await append
  assert.equal(opens, 2)
  assert.deepEqual(await store.read(1, 0, 1), Uint8Array.of(9))
  await store.dispose()
  assert.equal(closes, 2)
})

test('retains reset failures while disposal retries and closes other tracks', async () => {
  const failure = new Error('close failed')
  const closed: number[] = []
  let first = true
  const store = createDiskFragmentMedia(async trackId => ({
    async write(data) {
      return data.length
    },
    async read(data) {
      return data.length
    },
    async seal() {},
    async close() {
      closed.push(trackId)
      if (trackId === 1 && first) {
        first = false
        throw failure
      }
    },
  }))
  await store.append(1, Uint8Array.of(1))
  await store.append(2, Uint8Array.of(2))
  await assert.rejects(store.reset(1), error => error === failure)
  await assert.rejects(
    store.append(2, Uint8Array.of(3)),
    error => error === failure,
  )
  await store.dispose()
  assert.deepEqual(closed, [1, 1, 2])
})
