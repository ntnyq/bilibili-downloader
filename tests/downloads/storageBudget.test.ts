import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertMediaOutputSpace,
  createMediaStorageChecker,
  getAvailableMediaStorageBytes,
} from '../../utils/downloads/media/storageBudget'

const GIB = 1024 ** 3
const MIB = 1024 ** 2

test('allows inputs larger than 16 GiB when quota can hold input plus output', async () => {
  const check = createMediaStorageChecker(0, {
    async estimate() {
      return {
        quota: 100 * GIB,
        usage: 0,
      }
    },
  })
  await check({ received: 0, total: 20 * GIB, additionalBytes: 0 })
  await assert.rejects(
    check({ received: 0, total: 50 * GIB, additionalBytes: 0 }),
    /配额不足/,
  )
})

test('does not charge cached input twice and includes completed tracks in the output reserve', async () => {
  const estimate = async () => ({
    quota: 100 * GIB,
    usage: 78 * GIB,
  })
  await createMediaStorageChecker(0, { estimate })({
    received: 20 * GIB,
    total: 20 * GIB,
    additionalBytes: 0,
  })
  await assert.rejects(
    createMediaStorageChecker(0, { estimate })({
      received: 0,
      total: 20 * GIB,
      additionalBytes: 0,
    }),
    /配额不足/,
  )
  await assert.rejects(
    createMediaStorageChecker(10 * GIB, { estimate })({
      received: 20 * GIB,
      total: 20 * GIB,
      additionalBytes: 0,
    }),
    /配额不足/,
  )
})

test('refreshes quota during a transfer and responds to shrinking or growing capacity', async () => {
  let time = 0
  let quota = 100 * GIB
  const check = createMediaStorageChecker(0, {
    now: () => time,
    async estimate() {
      return {
        quota,
        usage: 0,
      }
    },
  })
  await check({ received: 0, total: 20 * GIB, additionalBytes: 0 })
  time = 1001
  quota = GIB
  await assert.rejects(
    check({ received: MIB, total: 20 * GIB, additionalBytes: MIB }),
    /配额不足/,
  )
  quota = 100 * GIB
  await check({ received: MIB, total: 20 * GIB, additionalBytes: MIB })
})

test('checks unknown-length downloads before writing and refreshes after bounded growth', async () => {
  let reads = 0
  const check = createMediaStorageChecker(0, {
    now: () => 0,
    async estimate() {
      reads++
      return {
        quota: 128 * MIB,
        usage: 0,
      }
    },
  })
  await check({ received: 0, total: null, additionalBytes: MIB })
  await check({ received: MIB, total: null, additionalBytes: MIB })
  assert.equal(reads, 1)
  await check({ received: 8 * MIB, total: null, additionalBytes: MIB })
  assert.equal(reads, 2)
  await assert.rejects(
    check({ received: 70 * MIB, total: null, additionalBytes: MIB }),
    /配额不足/,
  )
})

test('a changed representation releases the old accounting and takes a fresh snapshot', async () => {
  let reads = 0
  const check = createMediaStorageChecker(0, {
    now: () => 0,
    async estimate() {
      reads++
      return {
        quota: GIB,
        usage: 0,
      }
    },
  })
  await check({ received: 2 * MIB, total: 4 * MIB, additionalBytes: 0 })
  await check({ received: 0, total: 4 * MIB, additionalBytes: 0 })
  assert.equal(reads, 2)
})

test('missing estimates do not impose another fixed media cap', async () => {
  for (const estimate of [
    async () => ({}),
    async () => {
      throw new Error('unavailable')
    },
  ]) {
    assert.equal(await getAvailableMediaStorageBytes(estimate), null)
    await createMediaStorageChecker(0, { estimate })({
      received: 0,
      total: 100 * GIB,
      additionalBytes: 0,
    })
  }
})

test('output checks reserve only the new output and re-read the current quota', async () => {
  await assertMediaOutputSpace(20 * GIB, async () => ({
    quota: 100 * GIB,
    usage: 78 * GIB,
  }))
  await assert.rejects(
    assertMediaOutputSpace(20 * GIB, async () => ({
      quota: 100 * GIB,
      usage: 80 * GIB,
    })),
    /配额不足/,
  )
  assert.equal(
    await getAvailableMediaStorageBytes(async () => ({
      quota: GIB,
      usage: 2 * GIB,
    })),
    0,
  )
})
