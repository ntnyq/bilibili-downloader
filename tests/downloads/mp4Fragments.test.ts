import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { BlobSource, EncodedPacketSink, Input, MP4 } from 'mediabunny'
import { fragmentedMp4 } from '../fixtures/downloads/mp4Fragments'

for (const options of [
  { version: 0, widths: [1, 1, 1] },
  { version: 1, widths: [2, 3, 4] },
  {
    version: 0,
    widths: [4, 2, 3],
    tfdt: false,
    multipleRuns: true,
    indexReference: 2,
  },
  {
    version: 1,
    widths: [3, 4, 2],
    tfdt: false,
    reordered: true,
    multipleRuns: true,
    indexReference: 2,
  },
  {
    version: 1,
    widths: [1, 2, 3],
    padding: 5 * 1024 ** 3,
    indexPadding: 8 * 1024 * 1024,
  },
] as const) {
  test(`pages fMP4 TFRA and preserves packet/seek results: ${JSON.stringify(options)}`, async () => {
    const fixture = await fragmentedMp4({ fragments: 7003, ...options })
    const input = new Input({ formats: [MP4], source: fixture.source })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      for (const table of fixture.indexes) {
        assert.ok(
          !fixture.requests.some(
            read => read.start >= table.entries && read.start < table.end,
          ),
          'Track discovery must not read TFRA entries',
        )
      }
      const sink = new EncodedPacketSink(track)
      const boundary = Math.floor((16 * 1024) / fixture.entrySize)
      for (const fragment of [
        0,
        boundary - 1,
        boundary,
        boundary + 1,
        4097,
        6999,
        2,
        7002,
        0,
      ]) {
        for (let at = 0; at < 3; at++) {
          const index = fragment * 3 + at
          const packet = await sink.getPacket(fixture.timestamp(index))
          assert.ok(packet)
          assert.equal(packet.timestamp, fixture.timestamp(index))
          assert.deepEqual(packet.data, fixture.packet(1, index))
          assert.equal(packet.duration, 1024 / 48000)
          assert.equal(packet.type, at === 1 ? 'delta' : 'key')
          const candidates = Array.from(
            { length: 6 },
            (_, at) => fragment * 3 - 3 + at,
          )
            .filter(
              index =>
                index >= 0
                && index < 7003 * 3
                && index % 3 !== 1
                && fixture.timestamp(index) <= packet.timestamp,
            )
            .sort((a, b) => fixture.timestamp(a) - fixture.timestamp(b))
          const expectedKey = candidates.at(-1)
          const key = await sink.getKeyPacket(packet.timestamp)
          assert.equal(
            key?.timestamp ?? null,
            expectedKey === undefined ? null : fixture.timestamp(expectedKey),
          )
          if (key && expectedKey !== undefined) {
            assert.deepEqual(key.data, fixture.packet(1, expectedKey))
            const nextIndex = expectedKey + (expectedKey % 3 === 0 ? 2 : 1)
            const nextKey = await sink.getNextKeyPacket(key)
            assert.equal(
              nextKey?.timestamp ?? null,
              nextIndex < 7003 * 3 ? fixture.timestamp(nextIndex) : null,
            )
          }
          const next = await sink.getNextPacket(packet)
          assert.equal(
            next?.timestamp ?? null,
            index + 1 < 7003 * 3 ? fixture.timestamp(index + 1) : null,
          )
        }
      }
      assert.ok(
        fixture.requests.every(read => read.end - read.start <= 64 * 1024),
      )
      if (options.padding) {
        assert.ok(
          fixture.reads.every(
            read => read.start < 1024 || read.start >= options.padding,
          ),
        )
      }
    } finally {
      input.dispose()
    }
  })
}

for (const tfdt of [false, true]) {
  test(`rereads evicted fragments without an mfra index (tfdt=${tfdt})`, async () => {
    const fixture = await fragmentedMp4({
      fragments: 700,
      indexed: false,
      tfdt,
      reordered: true,
      compositionShift: 512,
      tracks: 2,
      shorterTrackFragments: 357,
    })
    const input = new Input({ formats: [MP4], source: fixture.source })
    try {
      const tracks = await input.getAudioTracks()
      assert.equal(tracks.length, 2)
      const sinks = tracks.map(track => new EncodedPacketSink(track))
      const held = await sinks[0]!.getPacket(fixture.timestamp(17))
      assert.ok(held)
      for (const index of [2097, 2, 1200, 500, 1700, 1, 1000, 20]) {
        const packet = await sinks[0]!.getPacket(fixture.timestamp(index))
        assert.deepEqual(packet?.data, fixture.packet(1, index))
        assert.equal(packet?.timestamp, fixture.timestamp(index))
      }
      const next = await sinks[0]!.getNextPacket(held)
      assert.equal(next?.timestamp, fixture.timestamp(18))
      const samples = [3, 1070, 600, 7, 1068, 200]
      const packets = await Promise.all(
        samples.map(index => sinks[1]!.getPacket(fixture.timestamp(index))),
      )
      for (const [at, index] of samples.entries()) {
        assert.equal(packets[at]?.timestamp, fixture.timestamp(index))
        assert.deepEqual(packets[at]?.data, fixture.packet(2, index))
      }
      assert.equal(await sinks[1]!.getNextPacket(packets[1]!), null)
    } finally {
      input.dispose()
    }
  })
}

for (const browser of [false, true]) {
  test(`uses bounded fMP4 indexing in the ${browser ? 'browser' : 'Node'} CommonJS bundle`, async () => {
    const require = createRequire(import.meta.url)
    const path = require.resolve('mediabunny')
    const library: typeof import('mediabunny') = require(
      browser ? path.replace('.node.cjs', '.cjs') : path,
    )
    const fixture = await fragmentedMp4({
      fragments: 3001,
      indexPadding: 8 * 1024 * 1024,
    })
    const reads: number[] = []
    class TrackedBlob extends Blob {
      override slice(start = 0, end = this.size, type?: string) {
        reads.push(Math.min(end, this.size) - start)
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
      for (const index of [9000, 1, 5000]) {
        const packet = await sink.getPacket(fixture.timestamp(index))
        assert.deepEqual(packet?.data, fixture.packet(1, index))
      }
      assert.ok(Math.max(...reads) <= 256 * 1024)
    } finally {
      input.dispose()
    }
  })
}

for (const mode of ['indexed', 'unindexed']) {
  test(`bounds retained fMP4 index heap and buffers (${mode})`, async () => {
    const measurements: { heap: number; buffers: number }[] = []
    for (const fragments of [2000, 40000]) {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          '--expose-gc',
          '--import',
          'tsx',
          fileURLToPath(
            new URL(
              '../fixtures/downloads/mp4FragmentMemory.ts',
              import.meta.url,
            ),
          ),
          String(fragments),
          mode,
        ],
        { timeout: 60000 },
      )
      const result: unknown = JSON.parse(stdout)
      assert.ok(result && typeof result === 'object')
      const heap: unknown = Reflect.get(result, 'retainedHeapBytes')
      const buffers: unknown = Reflect.get(result, 'retainedBufferBytes')
      assert.equal(typeof heap, 'number')
      assert.equal(typeof buffers, 'number')
      if (typeof heap !== 'number' || typeof buffers !== 'number') {
        throw new TypeError('Missing memory measurements')
      }
      measurements.push({ heap, buffers })
    }
    assert.ok(measurements[1]!.heap - measurements[0]!.heap < 2 * 1024 * 1024)
    assert.ok(measurements[1]!.buffers - measurements[0]!.buffers < 512 * 1024)
  })
}

function uint32(value: number) {
  const data = new Uint8Array(4)
  new DataView(data.buffer).setUint32(0, value)
  return data
}

test('preserves unordered TFRA lookup and falls back from unusable sample references', async () => {
  const fixture = await fragmentedMp4({
    fragments: 211,
    tfdt: false,
    multipleRuns: true,
    indexReference: 2,
  })
  const bytes = new Uint8Array(await fixture.blob().arrayBuffer())
  const table = fixture.indexes[0]!
  for (const [from, to] of [
    [0, 180],
    [180, 0],
  ] as const) {
    fixture.patches.set(
      table.entries + from * fixture.entrySize,
      bytes.slice(
        table.entries + to * fixture.entrySize,
        table.entries + (to + 1) * fixture.entrySize,
      ),
    )
  }
  // A nonzero reference outside this fragment must rebuild cumulative decode time.
  fixture.patches.set(
    table.entries + 100 * fixture.entrySize + 17,
    Uint8Array.of(99),
  )
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    for (const index of [603, 1, 300, 541, 630, 2]) {
      const packet = await sink.getPacket(fixture.timestamp(index))
      assert.equal(packet?.timestamp, fixture.timestamp(index))
      assert.deepEqual(packet?.data, fixture.packet(1, index))
    }
  } finally {
    input.dispose()
  }
})

test('deduplicates equal TFRA timestamps and skips zero sample references', async () => {
  const fixture = await fragmentedMp4({ fragments: 200 })
  const table = fixture.indexes[0]!
  fixture.patches.set(table.entries + fixture.entrySize, new Uint8Array(8))
  fixture.patches.set(
    table.entries + 150 * fixture.entrySize + 18,
    Uint8Array.of(0),
  )
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    for (const index of [0, 3, 450, 451, 599]) {
      assert.deepEqual(
        (await sink.getPacket(fixture.timestamp(index)))?.data,
        fixture.packet(1, index),
      )
    }
  } finally {
    input.dispose()
  }
})

test('serializes concurrent fragmented parsing across tracks and survives cache eviction', async () => {
  const fixture = await fragmentedMp4({
    fragments: 1301,
    tracks: 2,
    shorterTrackFragments: 403,
    tfdt: false,
    multipleRuns: true,
    indexReference: 2,
  })
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const tracks = await input.getAudioTracks()
    assert.deepEqual(
      tracks.map(track => track.id),
      [1, 2],
    )
    const sinks = tracks.map(track => new EncodedPacketSink(track))
    const requests = Array.from({ length: 24 }, (_, at) => ({
      track: at % 2,
      index: at % 2 ? (at * 47) % 1209 : (at * 173) % 3903,
    }))
    const packets = await Promise.all(
      requests.map(({ track, index }) =>
        sinks[track]!.getPacket(fixture.timestamp(index)),
      ),
    )
    for (const [at, { track, index }] of requests.entries()) {
      const packet = packets[at]
      assert.ok(packet)
      assert.equal(packet.timestamp, fixture.timestamp(index))
      assert.deepEqual(packet.data, fixture.packet(track + 1, index))
      const next = await sinks[track]!.getNextPacket(packet)
      assert.equal(
        next?.timestamp ?? null,
        index + 1 < fixture.trackCounts[track]! * 3
          ? fixture.timestamp(index + 1)
          : null,
      )
    }
  } finally {
    input.dispose()
  }
})

test('rejects truncated, unsupported and unsafe fragment indexes with bounded reads', async () => {
  for (const fault of [
    'count',
    'extent',
    'version',
    'mfra',
    'timestamp',
    'offset',
  ] as const) {
    const fixture = await fragmentedMp4({ fragments: 99 })
    const table = fixture.indexes[0]!
    if (fault === 'count') {
      fixture.patches.set(table.start + 20, uint32(0xffff_ffff))
    }
    if (fault === 'extent') {
      fixture.patches.set(table.start, uint32(0xffff_ffff))
    }
    if (fault === 'version') {
      fixture.patches.set(table.start + 8, uint32(0x0200_0000))
    }
    if (fault === 'mfra') {
      fixture.patches.set(
        fixture.mfraStart,
        uint32(fixture.size - fixture.mfraStart + 1),
      )
    }
    if (fault === 'timestamp' || fault === 'offset') {
      fixture.patches.set(
        table.entries + (fault === 'offset' ? 8 : 0),
        uint32(0x0020_0000),
      )
    }
    const input = new Input({ formats: [MP4], source: fixture.source })
    try {
      await assert.rejects(async () => {
        const track = await input.getPrimaryAudioTrack()
        assert.ok(track)
        await new EncodedPacketSink(track).getPacket(1)
      }, /Truncated tfra|container|Unsupported tfra|Invalid mfra|Unsafe tfra/u)
      assert.ok(
        fixture.requests.every(read => read.end - read.start <= 64 * 1024),
      )
    } finally {
      input.dispose()
    }
  }
})

for (const cancel of [false, true]) {
  test(`${cancel ? 'propagates cancellation' : 'retries I/O failure'} while awaiting a TFRA page`, async () => {
    const fixture = await fragmentedMp4({ fragments: 5003 })
    const read: unknown = Reflect.get(fixture.source, '_read')
    assert.equal(typeof read, 'function')
    if (typeof read !== 'function') {
      throw new TypeError('Missing source reader')
    }
    const diskError = new Error('fragment index unavailable')
    let shouldFail = false
    const input = new Input({ formats: [MP4], source: fixture.source })
    Object.defineProperty(fixture.source, '_read', {
      value(start: number, end: number, ...args: unknown[]) {
        if (shouldFail && start >= fixture.indexes[0]!.entries) {
          shouldFail = false
          if (!cancel) {
            throw diskError
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
      shouldFail = true
      await assert.rejects(
        sink.getPacket(fixture.timestamp(14000)),
        cancel ? /disposed/iu : error => error === diskError,
      )
      if (!cancel) {
        const packet = await sink.getPacket(fixture.timestamp(14000))
        assert.deepEqual(packet?.data, fixture.packet(1, 14000))
      }
    } finally {
      input.dispose()
    }
  })
}

test('evicts TFRA pages and rereads them after distant seeks', async () => {
  const fixture = await fragmentedMp4({ fragments: 14003 })
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    assert.ok(await sink.getFirstPacket())
    assert.ok(await sink.getPacket(0))
    const firstPageReads = () =>
      fixture.requests.filter(
        read => read.start === fixture.indexes[0]!.entries,
      ).length
    const before = firstPageReads()
    for (const fragment of [12000, 5000, 10000, 3000, 8000]) {
      assert.ok(await sink.getPacket(fixture.timestamp(fragment * 3)))
    }
    assert.deepEqual((await sink.getPacket(0))?.data, fixture.packet(1, 0))
    assert.ok(firstPageReads() > before)
  } finally {
    input.dispose()
  }
})

for (const tfdt of [true, false]) {
  test(`reads a fragment-only segment with a separate init input (tfdt=${tfdt})`, async () => {
    const fixture = await fragmentedMp4({
      fragments: 257,
      indexed: false,
      tfdt,
      compositionShift: 512,
    })
    const initInput = new Input({
      formats: [MP4],
      source: new BlobSource(fixture.initBlob()),
    })
    const input = new Input({
      formats: [MP4],
      initInput,
      source: new BlobSource(fixture.segmentBlob()),
    })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      const sink = new EncodedPacketSink(track)
      for (const index of [768, 0, 500, 1, 770]) {
        const packet = await sink.getPacket(fixture.timestamp(index))
        assert.equal(packet?.timestamp, fixture.timestamp(index))
        assert.deepEqual(packet?.data, fixture.packet(1, index))
      }
    } finally {
      input.dispose()
      initInput.dispose()
    }
  })
}

test('backs off faulty TFRA hints without losing the earlier matching fragment', async () => {
  const fixture = await fragmentedMp4({ fragments: 301 })
  const table = fixture.indexes[0]!
  const badOffset = new Uint8Array(8)
  new DataView(badOffset.buffer).setBigUint64(
    0,
    BigInt(fixture.fragmentOffset(1, 220)),
  )
  for (let index = 8; index <= 128; index++) {
    fixture.patches.set(
      table.entries + index * fixture.entrySize + 8,
      badOffset,
    )
  }
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const packet = await new EncodedPacketSink(track).getPacket(
      fixture.timestamp(385),
    )
    assert.deepEqual(packet?.data, fixture.packet(1, 385))
    assert.equal(packet?.timestamp, fixture.timestamp(385))
  } finally {
    input.dispose()
  }
})

test('retries failed fragment parsing without publishing an incomplete timeline', async () => {
  const fixture = await fragmentedMp4({
    fragments: 501,
    indexed: false,
    tfdt: false,
    compositionShift: 512,
  })
  const read: unknown = Reflect.get(fixture.source, '_read')
  assert.equal(typeof read, 'function')
  if (typeof read !== 'function') {
    throw new TypeError('Missing source reader')
  }
  const input = new Input({ formats: [MP4], source: fixture.source })
  const diskError = new Error('fragment read failed')
  let shouldFail = true
  const target = fixture.fragmentOffset(1, 300)
  Object.defineProperty(fixture.source, '_read', {
    value(start: number, end: number, ...args: unknown[]) {
      if (shouldFail && start === target) {
        shouldFail = false
        throw diskError
      }
      return Reflect.apply(read, fixture.source, [start, end, ...args])
    },
  })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    await assert.rejects(
      sink.getPacket(fixture.timestamp(901)),
      error => error === diskError,
    )
    const packet = await sink.getPacket(fixture.timestamp(901))
    assert.equal(packet?.timestamp, fixture.timestamp(901))
    assert.deepEqual(packet?.data, fixture.packet(1, 901))
  } finally {
    input.dispose()
  }
})

test('copies TFRA pages from Buffer-backed source windows', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--expose-gc',
      '--import',
      'tsx',
      fileURLToPath(
        new URL('../fixtures/downloads/mp4FragmentMemory.ts', import.meta.url),
      ),
      '2000',
      'indexed',
      'buffer-pages',
    ],
    { timeout: 60000 },
  )
  assert.match(stdout, /"retainedBufferBytes":/u)
})

for (const tfdt of [true, false]) {
  test(`reuses recently visited backward seek hints after distant eviction (tfdt=${tfdt})`, async () => {
    const fixture = await fragmentedMp4({
      fragments: 701,
      indexed: false,
      tfdt,
    })
    const input = new Input({ formats: [MP4], source: fixture.source })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      const sink = new EncodedPacketSink(track)
      assert.ok(await sink.getPacket(fixture.timestamp(2000)))
      assert.ok(await sink.getPacket(fixture.timestamp(300)))
      const before = fixture.requests.length
      const packet = await sink.getPacket(fixture.timestamp(303))
      assert.deepEqual(packet?.data, fixture.packet(1, 303))
      assert.ok(
        !fixture.requests
          .slice(before)
          .some(read => read.start === fixture.fragmentStart),
        'A nearby seek must reuse the recent hint instead of rescanning the file prefix',
      )
    } finally {
      input.dispose()
    }
  })
}
