import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { EncodedPacketSink, Input, MP4 } from 'mediabunny'
import {
  encryptedMoof,
  largeMoof,
  moofWords,
} from '../fixtures/downloads/mp4Moof'

for (const order of ['forward', 'reverse', 'shuffle', 'ties'] as const) {
  for (const runSize of [1, 263, 2003]) {
    test(`pages one moof and preserves every sample (${order}, run=${runSize})`, async () => {
      const fixture = await largeMoof({
        samples: 2003,
        runSize,
        order,
        version: runSize === 263 ? 0 : 1,
      })
      const input = new Input({ formats: [MP4], source: fixture.source })
      try {
        const track = await input.getPrimaryAudioTrack()
        assert.ok(track)
        const sink = new EncodedPacketSink(track)
        const sorted = Array.from(
          { length: fixture.samples },
          (_, index) => index,
        ).sort((a, b) => fixture.pts(a) - fixture.pts(b) || a - b)
        const durations = new Map(
          sorted.map((index, at) => [
            index,
            at + 1 < sorted.length
              ? fixture.pts(sorted[at + 1]!) - fixture.pts(index)
              : fixture.duration(index),
          ]),
        )
        let packet = await sink.getFirstPacket()
        const held = packet
        for (let index = 0; index < fixture.samples; index++) {
          assert.ok(packet, `Missing sample ${index}`)
          assert.deepEqual(packet.data, fixture.packet(index))
          assert.equal(packet.timestamp, fixture.pts(index) / 48000)
          assert.equal(
            packet.duration,
            durations.get(index)! / 48000,
            `Duration at sample ${index}`,
          )
          assert.equal(packet.type, fixture.isKey(index) ? 'key' : 'delta')
          packet = await sink.getNextPacket(packet)
        }
        assert.equal(packet, null)
        assert.ok(held)
        assert.deepEqual(
          (await sink.getNextPacket(held))?.data,
          fixture.packet(1),
        )
        const indices = [1999, 0, 1024, 17, 261, 2002, 2]
        const packets = await Promise.all(
          indices.map(index => sink.getPacket(fixture.pts(index) / 48000)),
        )
        for (const [at, index] of indices.entries()) {
          const expected = sorted.findLast(
            candidate => fixture.pts(candidate) <= fixture.pts(index),
          )!
          assert.deepEqual(packets[at]?.data, fixture.packet(expected))
          const keyIndex = sorted.findLast(
            candidate =>
              fixture.isKey(candidate)
              && fixture.pts(candidate) <= fixture.pts(index),
          )
          const key = await sink.getKeyPacket(fixture.pts(index) / 48000)
          assert.deepEqual(
            key?.data ?? null,
            keyIndex === undefined ? null : fixture.packet(keyIndex),
          )
          if (key && keyIndex !== undefined) {
            let next = keyIndex + 1
            while (next < fixture.samples && !fixture.isKey(next)) {
              next++
            }
            assert.deepEqual(
              (await sink.getNextKeyPacket(key))?.data ?? null,
              next < fixture.samples ? fixture.packet(next) : null,
            )
          }
        }
        assert.ok(
          fixture.requests.every(read => read.end - read.start <= 64 * 1024),
        )
      } finally {
        input.dispose()
      }
    })
  }
}

for (const zeroDuration of [false, true]) {
  test(`handles enormous default-only trun without expanding samples (zero=${zeroDuration})`, async () => {
    const count = 0xffff_fffe
    const fixture = await largeMoof({
      samples: count,
      defaults: true,
      zeroDuration,
    })
    const input = new Input({ formats: [MP4], source: fixture.source })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      const sink = new EncodedPacketSink(track)
      const first = await sink.getFirstPacket({ metadataOnly: true })
      assert.ok(first)
      assert.equal(first.type, 'key')
      const last = await sink.getPacket(
        zeroDuration ? 0 : ((count - 1) * 1024) / 48000,
        { metadataOnly: true },
      )
      assert.ok(last)
      assert.equal(
        last.timestamp,
        zeroDuration ? 0 : ((count - 1) * 1024) / 48000,
      )
      assert.equal(last.duration, zeroDuration ? 0 : 1024 / 48000)
      assert.equal(
        await sink.getNextKeyPacket(first, { metadataOnly: true }),
        null,
      )
      assert.equal(
        (await sink.getKeyPacket(last.timestamp, { metadataOnly: true }))
          ?.timestamp,
        0,
      )
      assert.equal(await sink.getNextPacket(last, { metadataOnly: true }), null)
      assert.ok(fixture.requests.length < 1000)
    } finally {
      input.dispose()
    }
  })
}

test('skips multi-gigabyte padding inside an extended-size moof', async () => {
  const fixture = await largeMoof({
    samples: 5003,
    padding: 5 * 1024 ** 3,
    runSize: 1001,
  })
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    for (const index of [5002, 0, 1024, 2002]) {
      assert.deepEqual(
        (await sink.getPacket(fixture.pts(index) / 48000))?.data,
        fixture.packet(index),
      )
    }
    assert.ok(fixture.requests.length < 1000)
    assert.ok(
      fixture.requests.every(
        read =>
          read.end - read.start <= 16
          || read.start < fixture.moofStart + 100
          || read.start
            >= Math.floor((fixture.runStart - 100) / (16 * 1024)) * 16 * 1024,
      ),
    )
  } finally {
    input.dispose()
  }
})

for (const browser of [false, true]) {
  test(`pages input trun in ${browser ? 'browser' : 'Node'} CommonJS`, async () => {
    const require = createRequire(import.meta.url)
    const path = require.resolve('mediabunny')
    const library: typeof import('mediabunny') = require(
      browser ? path.replace('.node.cjs', '.cjs') : path,
    )
    const fixture = await largeMoof({
      samples: 10003,
      order: 'reverse',
      runSize: 1001,
    })
    const reads: number[] = []
    class TrackedBlob extends Blob {
      override slice(start = 0, end = this.size, type?: string) {
        reads.push(Math.min(this.size, end) - start)
        return super.slice(start, end, type)
      }
    }
    const input = new library.Input({
      formats: [library.MP4],
      source: new library.BlobSource(new TrackedBlob([fixture.blob()]), {
        useStreamReader: false,
        maxCacheSize: 128 * 1024,
      }),
    })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      const sink = new library.EncodedPacketSink(track)
      for (const index of [10002, 0, 4096, 8193]) {
        assert.deepEqual(
          (await sink.getPacket(fixture.pts(index) / 48000))?.data,
          fixture.packet(index),
        )
      }
      assert.ok(Math.max(...reads) <= 256 * 1024)
    } finally {
      input.dispose()
    }
  })
}

for (const fault of ['count', 'version', 'extent', 'offset'] as const) {
  test(`rejects malformed paged trun: ${fault}`, async () => {
    const fixture = await largeMoof()
    if (fault === 'count') {
      fixture.patches.set(fixture.runStart + 12, moofWords(0xffff_ffff))
    }
    if (fault === 'version') {
      fixture.patches.set(fixture.runStart + 8, moofWords(0x0200_0f05))
    }
    if (fault === 'extent') {
      fixture.patches.set(fixture.runStart, moofWords(0xffff_ffff))
    }
    if (fault === 'offset') {
      fixture.patches.set(fixture.runStart + 16, moofWords(0x8000_0000))
    }
    const input = new Input({ formats: [MP4], source: fixture.source })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      await assert.rejects(
        new EncodedPacketSink(track).getFirstPacket(),
        /Truncated trun|Unsupported trun|container|Unsafe fragment/u,
      )
    } finally {
      input.dispose()
    }
  })
}

for (const cancel of [false, true]) {
  test(`${cancel ? 'cancels' : 'retries'} input moof page reads after eviction`, async () => {
    const fixture = await largeMoof({ samples: 30003 })
    const input = new Input({ formats: [MP4], source: fixture.source })
    const read: unknown = Reflect.get(fixture.source, '_read')
    assert.equal(typeof read, 'function')
    if (typeof read !== 'function') {
      throw new TypeError('Missing reader')
    }
    let armed = false
    const failure = new Error('moof page failed')
    Object.defineProperty(fixture.source, '_read', {
      value(start: number, end: number, ...args: unknown[]) {
        if (armed && start >= fixture.runStart && end < fixture.mediaStart) {
          armed = false
          if (!cancel) {
            throw failure
          }
          return Promise.resolve(
            Reflect.apply(read, fixture.source, [start, end, ...args]),
          ).then(data => {
            input.dispose()
            return data
          })
        }
        return Reflect.apply(read, fixture.source, [start, end, ...args])
      },
    })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      const sink = new EncodedPacketSink(track)
      const held = await sink.getFirstPacket()
      assert.ok(held)
      assert.ok(await sink.getPacket(fixture.pts(29000) / 48000))
      armed = true
      await assert.rejects(
        sink.getPacket(fixture.pts(14000) / 48000),
        cancel ? /disposed/iu : error => error === failure,
      )
      if (!cancel) {
        assert.deepEqual(
          (await sink.getPacket(fixture.pts(14000) / 48000))?.data,
          fixture.packet(14000),
        )
        assert.deepEqual(
          (await sink.getNextPacket(held))?.data,
          fixture.packet(1),
        )
      }
    } finally {
      input.dispose()
    }
  })
}

for (const mode of ['single', 'many-runs', 'buffer-pages']) {
  test(`bounds one moof's retained heap and buffers (${mode})`, async () => {
    const measurements: { heap: number; buffers: number }[] = []
    for (const count of mode === 'buffer-pages' ? [20000] : [20000, 400000]) {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          '--expose-gc',
          '--import',
          'tsx',
          fileURLToPath(
            new URL('../fixtures/downloads/mp4MoofMemory.ts', import.meta.url),
          ),
          String(count),
          mode,
        ],
        { timeout: 90000 },
      )
      const result: unknown = JSON.parse(stdout)
      assert.ok(result && typeof result === 'object')
      const heap: unknown = Reflect.get(result, 'heap')
      const buffers: unknown = Reflect.get(result, 'buffers')
      assert.equal(typeof heap, 'number')
      assert.equal(typeof buffers, 'number')
      if (typeof heap !== 'number' || typeof buffers !== 'number') {
        throw new TypeError('Missing memory values')
      }
      assert.ok(heap < 4 * 1024 * 1024, stdout)
      assert.ok(buffers < 1024 * 1024, stdout)
      measurements.push({ heap, buffers })
    }
    if (measurements.length === 2) {
      assert.ok(measurements[1]!.heap - measurements[0]!.heap < 2 * 1024 * 1024)
      assert.ok(
        measurements[1]!.buffers - measurements[0]!.buffers < 512 * 1024,
      )
    }
  })
}

for (const mode of ['senc', 'senc-subsamples', 'aux', 'aux-fixed'] as const) {
  test(`decrypts input samples with paged ${mode} metadata`, async () => {
    const fixture = await encryptedMoof(mode)
    let keys = 0
    const input = new Input({
      formats: [MP4],
      source: fixture.source,
      formatOptions: {
        isobmff: {
          resolveKeyId({ keyId }) {
            assert.equal(keyId, '17'.repeat(16))
            keys++
            return fixture.key
          },
        },
      },
    })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      const sink = new EncodedPacketSink(track)
      assert.ok(
        await sink.getPacket(fixture.pts(4999) / 48000, { metadataOnly: true }),
      )
      assert.equal(keys, 0)
      for (const index of [5002, 0, 1024, 4097, 17, 2000, 1]) {
        const packet = await sink.getPacket(fixture.pts(index) / 48000)
        assert.deepEqual(packet?.data, fixture.packet(index))
      }
      assert.equal(keys, 1)
      assert.ok(
        fixture.requests.every(read => read.end - read.start <= 64 * 1024),
      )
    } finally {
      input.dispose()
    }
  })
}

test('reads explicit trun rows beyond the former per-fragment sample cap', async () => {
  const fixture = await largeMoof({ samples: 2 ** 20 + 7, recordReads: false })
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    const index = fixture.samples - 1
    const packet = await sink.getPacket(fixture.pts(index) / 48000)
    assert.deepEqual(packet?.data, fixture.packet(index))
    assert.equal(await sink.getNextPacket(packet!), null)
  } finally {
    input.dispose()
  }
})

test('combines arithmetic default runs with reordered explicit sample rows', async () => {
  const fixture = await largeMoof({
    samples: 8193,
    runSize: 4096,
    order: 'reverse',
  })
  // Keep the original trun extent: unused bytes are legal trailing box padding.
  fixture.patches.set(fixture.runStart + 8, moofWords(0x01000005))
  const shift = 3 * Math.floor(4096 / 3) + ((4096 % 3) * ((4096 % 3) - 1)) / 2
  const pts = (index: number) =>
    index < 4096 ? index * 1024 : fixture.pts(index) - shift
  const sorted = Array.from(
    { length: fixture.samples },
    (_, index) => index,
  ).sort((a, b) => pts(a) - pts(b) || a - b)
  const durations = new Map(
    sorted.map((index, at) => [
      index,
      at + 1 < sorted.length
        ? pts(sorted[at + 1]!) - pts(index)
        : index < 4096
          ? 1024
          : fixture.duration(index),
    ]),
  )
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    let packet = await sink.getFirstPacket({ metadataOnly: true })
    for (let index = 0; index < fixture.samples; index++) {
      assert.ok(packet)
      assert.equal(packet.timestamp, pts(index) / 48000)
      assert.equal(
        packet.duration,
        durations.get(index)! / 48000,
        `Duration for mixed sample ${index}`,
      )
      packet = await sink.getNextPacket(packet, { metadataOnly: true })
    }
    assert.equal(packet, null)
    for (const index of [0, 2048, 4095, 7000, 8192]) {
      const expected = sorted.findLast(
        candidate => pts(candidate) <= pts(index),
      )!
      const found = await sink.getPacket(pts(index) / 48000, {
        metadataOnly: true,
      })
      assert.equal(found?.sequenceNumber, fixture.moofStart + expected)
    }
  } finally {
    input.dispose()
  }
})
