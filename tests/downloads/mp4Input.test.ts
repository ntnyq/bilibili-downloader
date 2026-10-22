import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { CustomSource, EncodedPacketSink, Input, MP4 } from 'mediabunny'
import { remuxMedia } from '../../utils/downloads/remuxMedia'
import { indexedMp4 } from '../fixtures/downloads/mp4Index'
import type { StreamTargetChunk } from 'mediabunny'

for (const options of [
  { fieldSize: 0, samples: 17003 },
  { fieldSize: 0, samples: 17003, constantSize: true },
  { fieldSize: 4, samples: 131079 },
  { fieldSize: 8, samples: 65539 },
  { fieldSize: 16, samples: 32771 },
  {
    fieldSize: 0,
    samples: 17003,
    cttsVersion: 1,
    compositionOffsets: [-10, 0, 10],
  },
  { fieldSize: 0, samples: 17003, co64: true, padding: 5 * 1024 ** 3 },
] as const) {
  test(`lazily pages MP4 tables and seeks correctly: ${JSON.stringify(options)}`, async () => {
    const fixture = await indexedMp4(options)
    const input = new Input({ formats: [MP4], source: fixture.source })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      assert.equal(await track.getCodec(), 'aac')
      // Header reads can overlap a few fields, but track discovery must not
      // materialize the sample-table payloads.
      for (const table of fixture.tableRanges) {
        assert.ok(
          !fixture.requests.some(
            read => read.start < table.end && read.end > table.start + 32,
          ),
        )
      }
      const sink = new EncodedPacketSink(track)
      const sizePageBoundary = options.fieldSize
        ? (16 * 1024 * 8) / options.fieldSize
        : 4096
      const probes = [
        0,
        1,
        1364,
        1365,
        1366,
        2047,
        2048,
        2049,
        4095,
        4096,
        4097,
        5459,
        5460,
        5461,
        8190,
        8191,
        8192,
        16380,
        16381,
        16382,
        sizePageBoundary - 1,
        sizePageBoundary,
        sizePageBoundary + 1,
        fixture.samples - 2,
        fixture.samples - 1,
      ].filter(index => index < fixture.samples)
      for (const index of probes.reverse()) {
        const packet = await sink.getPacket(fixture.timestamp(index))
        assert.ok(packet)
        assert.equal(packet.timestamp, fixture.timestamp(index))
        assert.equal(packet.type, 'key')
        assert.deepEqual(packet.data, fixture.packet(index))
        if (index + 1 < fixture.samples) {
          const next = await sink.getNextPacket(packet)
          assert.ok(next)
          assert.equal(next.timestamp, fixture.timestamp(index + 1))
          assert.deepEqual(next.data, fixture.packet(index + 1))
        } else {
          assert.equal(await sink.getNextPacket(packet), null)
        }
      }
      const key = await sink.getKeyPacket(fixture.timestamp(16382) + 0.001)
      assert.ok(key)
      assert.equal(key.timestamp, fixture.timestamp(16382))
      assert.ok(
        fixture.reads.every(read => read.end - read.start <= 256 * 1024),
      )
      assert.ok(
        fixture.reads.every(
          read =>
            !options.padding
            || read.start < 128
            || read.start > options.padding,
        ),
      )
    } finally {
      input.dispose()
    }
  })
}

test('serializes simultaneous sample-table loads across tracks and shares same-track initialization', async () => {
  const fixture = await indexedMp4({ tracks: 2 })
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const tracks = await input.getAudioTracks()
    assert.equal(tracks.length, 2)
    const sinks = tracks.map(track => new EncodedPacketSink(track))
    const packets = await Promise.all(
      [0, 16000, 8192, 2, 17000, 8191].map((index, at) =>
        sinks[at % 2]!.getPacket(fixture.timestamp(index)),
      ),
    )
    for (const [at, index] of [0, 16000, 8192, 2, 17000, 8191].entries()) {
      const packet = packets[at]
      assert.ok(packet)
      assert.equal(packet.timestamp, fixture.timestamp(index))
      assert.deepEqual(packet.data, fixture.packet(index))
    }
    for (const table of fixture.tableRanges) {
      if (table.name !== 'stts') {
        continue
      }
      assert.equal(
        fixture.requests.filter(
          read => read.start === table.start + 8 && read.end - read.start === 8,
        ).length,
        1,
      )
    }
  } finally {
    input.dispose()
  }
})

test('rejects truncated or out-of-container sample tables before oversized reads', async () => {
  for (const fieldSize of [0, 4, 8, 16] as const) {
    const fixture = await indexedMp4({
      samples: 100,
      co64: fieldSize === 0,
      fieldSize,
    })
    const original = new Uint8Array(await fixture.blob().arrayBuffer())
    for (const table of fixture.tableRanges) {
      for (const corruption of ['count', 'extent'] as const) {
        const data = original.slice()
        const countOffset =
          table.name === 'stsz' || table.name === 'stz2' ? 16 : 12
        new DataView(data.buffer).setUint32(
          table.start + (corruption === 'count' ? countOffset : 0),
          0xffff_ffff,
        )
        const reads: number[] = []
        const input = new Input({
          formats: [MP4],
          source: new CustomSource({
            getSize: () => data.length,
            maxCacheSize: 0,
            read(start, end) {
              reads.push(end - start)
              return data.slice(start, end)
            },
          }),
        })
        try {
          await assert.rejects(async () => {
            const track = await input.getPrimaryAudioTrack()
            assert.ok(track)
            await new EncodedPacketSink(track).getFirstPacket()
          }, /Truncated .* sample table|beyond its container/u)
          assert.ok(reads.every(length => length <= 64 * 1024))
        } finally {
          input.dispose()
        }
      }
    }
  }
})

test('propagates input I/O failures and retries a failed sample-table initialization', async () => {
  const fixture = await indexedMp4()
  const data = new Uint8Array(await fixture.blob().arrayBuffer())
  const diskError = new Error('index read failed')
  let shouldFail = false
  const input = new Input({
    formats: [MP4],
    source: new CustomSource({
      getSize: () => data.length,
      maxCacheSize: 0,
      read(start, end) {
        if (shouldFail) {
          shouldFail = false
          throw diskError
        }
        return data.slice(start, end)
      },
    }),
  })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    shouldFail = true
    await assert.rejects(sink.getFirstPacket(), error => error === diskError)
    const packet = await sink.getFirstPacket()
    assert.ok(packet)
    assert.deepEqual(packet.data, fixture.packet(0))
  } finally {
    input.dispose()
  }
})

test('propagates cancellation while awaiting an index page', async () => {
  const fixture = await indexedMp4()
  let shouldDispose = false
  const data = new Uint8Array(await fixture.blob().arrayBuffer())
  const input = new Input({
    formats: [MP4],
    source: new CustomSource({
      getSize: () => data.length,
      maxCacheSize: 0,
      async read(start, end) {
        if (shouldDispose) {
          input.dispose()
        }
        await Promise.resolve()
        return data.slice(start, end)
      },
    }),
  })
  const track = await input.getPrimaryAudioTrack()
  assert.ok(track)
  shouldDispose = true
  try {
    await assert.rejects(
      new EncodedPacketSink(track).getFirstPacket(),
      /disposed/iu,
    )
  } finally {
    input.dispose()
  }
})

test('uses bounded Blob reads when remuxing an MP4 with a large padded moov', async () => {
  const fixture = await indexedMp4({ samples: 17003, padding: 8 * 1024 * 1024 })
  const original = fixture.blob()
  const reads: number[] = []
  class TrackedBlob extends Blob {
    override slice(start = 0, end = this.size, type?: string) {
      reads.push(Math.min(end, this.size) - start)
      return super.slice(start, end, type)
    }
  }
  const blob = new TrackedBlob([original])
  let writtenBytes = 0
  await remuxMedia(
    'audio',
    [blob],
    new WritableStream<StreamTargetChunk>({
      write({ data }) {
        writtenBytes += data.length
      },
    }),
    new AbortController().signal,
  )
  assert.ok(writtenBytes > 100000)
  assert.ok(
    Math.max(...reads) <= 256 * 1024,
    `Largest Blob read: ${Math.max(...reads)}`,
  )
  assert.ok(Math.max(...reads) < fixture.moovSize)
})

for (const browser of [false, true]) {
  test(`applies the input indexing patch to the ${browser ? 'browser' : 'Node'} CommonJS bundle`, async () => {
    const require = createRequire(import.meta.url)
    const path = require.resolve('mediabunny')
    const library: typeof import('mediabunny') = require(
      browser ? path.replace('.node.cjs', '.cjs') : path,
    )
    const fixture = await indexedMp4({ padding: 8 * 1024 * 1024 })
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
      }),
    })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      const packet = await new library.EncodedPacketSink(track).getPacket(
        fixture.timestamp(16382),
      )
      assert.ok(packet)
      assert.deepEqual(packet.data, fixture.packet(16382))
      assert.ok(Math.max(...reads) <= 256 * 1024)
    } finally {
      input.dispose()
    }
  })
}

for (const fieldSize of [0, 4, 8, 16] as const) {
  test(`pages variable sample sizes inside multi-sample chunks (${fieldSize} bits)`, async () => {
    const fixture = await indexedMp4({
      samples: 40003,
      fieldSize,
      chunkPattern: [3, 7, 20001, 2, 11],
      compositionOffsets: [],
      keyInterval: 17,
    })
    const input = new Input({ formats: [MP4], source: fixture.source })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      const sink = new EncodedPacketSink(track)
      for (const index of [20002, 3, 16383, 10, 32768, 16384, 1, 40002, 0]) {
        const packet = await sink.getPacket(fixture.timestamp(index))
        assert.ok(packet)
        assert.deepEqual(packet.data, fixture.packet(index))
        assert.equal(packet.timestamp, fixture.timestamp(index))
        assert.equal(packet.duration, fixture.delta(index))
        assert.equal(packet.type, index % 17 === 0 ? 'key' : 'delta')
        const key = await sink.getKeyPacket(fixture.timestamp(index))
        assert.equal(key?.timestamp, fixture.timestamp(index - (index % 17)))
      }
    } finally {
      input.dispose()
    }
  })
}

for (const options of [
  {
    deltas: [0, 0, 10, 15],
    compositionOffsets: [-10, 30, 0, 10, -20],
    cttsVersion: 1,
  },
  {
    deltas: [10, 0, 5],
    compositionOffsets: [0, 30, 10],
    compositionSamples: 47,
  },
  { deltas: [1024], compositionOffsets: [0, 3_000_000_000] },
] as const) {
  test(`preserves presentation order, ties, durations and keyframe seeks: ${JSON.stringify(options)}`, async () => {
    const fixture = await indexedMp4({
      samples: 91,
      keyInterval: 5,
      ...options,
    })
    const input = new Input({ formats: [MP4], source: fixture.source })
    try {
      const track = await input.getPrimaryAudioTrack()
      assert.ok(track)
      const sink = new EncodedPacketSink(track)
      const order = Array.from(
        { length: fixture.samples },
        (_, index) => index,
      ).sort((a, b) => fixture.timestamp(a) - fixture.timestamp(b) || a - b)
      let packet = await sink.getFirstPacket()
      for (let index = 0; index < fixture.samples; index++) {
        assert.ok(packet)
        assert.equal(packet.timestamp, fixture.timestamp(index))
        assert.deepEqual(packet.data, fixture.packet(index))
        const next = order[order.indexOf(index) + 1]
        const duration =
          next === undefined
            ? fixture.delta(index)
            : fixture.timestamp(next) - fixture.timestamp(index)
        assert.ok(Math.abs(packet.duration - duration) < 1e-10)
        packet = await sink.getNextPacket(packet)
      }
      assert.equal(packet, null)
      for (const index of order) {
        for (const keyOnly of [false, true]) {
          const time = fixture.timestamp(index)
          const expected = order.findLast(
            other =>
              fixture.timestamp(other) <= time && (!keyOnly || other % 5 === 0),
          )
          const found = keyOnly
            ? await sink.getKeyPacket(time)
            : await sink.getPacket(time)
          assert.equal(
            found?.timestamp ?? null,
            expected === undefined ? null : fixture.timestamp(expected),
          )
          if (expected !== undefined) {
            assert.deepEqual(found?.data, fixture.packet(expected))
          }
        }
      }
    } finally {
      input.dispose()
    }
  })
}

test('evicts index pages, rereads on demand and retries packet-page I/O failures', async () => {
  const fixture = await indexedMp4({ samples: 90003, compositionOffsets: [] })
  const read: unknown = Reflect.get(fixture.source, '_read')
  assert.equal(typeof read, 'function')
  if (typeof read !== 'function') {
    throw new TypeError('Missing source reader')
  }
  const diskError = new Error('sample page unavailable')
  let shouldFail = false
  Object.defineProperty(fixture.source, '_read', {
    configurable: true,
    value(...args: unknown[]) {
      if (shouldFail) {
        shouldFail = false
        throw diskError
      }
      return Reflect.apply(read, fixture.source, args)
    },
  })
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    assert.ok(await sink.getFirstPacket())
    const sizeTable = fixture.tableRanges.find(table => table.name === 'stsz')!
    const sizeReads = () =>
      fixture.requests.filter(request => request.start === sizeTable.start + 20)
        .length
    const before = sizeReads()
    for (let index = 4096; index < fixture.samples; index += 4096) {
      const packet = await sink.getPacket(fixture.timestamp(index))
      assert.deepEqual(packet?.data, fixture.packet(index))
    }
    shouldFail = true
    await assert.rejects(sink.getFirstPacket(), error => error === diskError)
    assert.deepEqual((await sink.getFirstPacket())?.data, fixture.packet(0))
    assert.ok(
      sizeReads() > before,
      'The evicted sample-size page must be reread',
    )
  } finally {
    input.dispose()
  }
})

test('bounds retained sample-table heap and buffers as sample count grows', async () => {
  const measurements: {
    retainedHeapBytes: number
    retainedBufferBytes: number
  }[] = []
  for (const samples of [20000, 400000]) {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--expose-gc',
        '--import',
        'tsx',
        fileURLToPath(
          new URL('../fixtures/downloads/mp4TableMemory.ts', import.meta.url),
        ),
        String(samples),
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
    measurements.push({ retainedHeapBytes: heap, retainedBufferBytes: buffers })
  }
  assert.ok(
    measurements[1]!.retainedHeapBytes - measurements[0]!.retainedHeapBytes
      < 2 * 1024 * 1024,
  )
  assert.ok(
    measurements[1]!.retainedBufferBytes - measurements[0]!.retainedBufferBytes
      < 512 * 1024,
  )
})

test('groups PCM frames into chunks without retaining per-chunk sample records', async () => {
  const fixture = await indexedMp4({
    samples: 100003,
    pcm: true,
    deltas: [1],
    chunkPattern: [3, 5, 9],
    compositionOffsets: [],
  })
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    assert.equal(await track.getCodec(), 'pcm-s16')
    const sink = new EncodedPacketSink(track)
    for (const chunkIndex of [
      0,
      8191,
      16384,
      9000,
      fixture.chunks.length - 1,
      1,
    ]) {
      const chunk = fixture.chunks[chunkIndex]!
      const packet = await sink.getPacket(
        fixture.timestamp(chunk.start + Math.min(1, chunk.count - 1)),
      )
      assert.ok(packet)
      assert.equal(packet.timestamp, fixture.timestamp(chunk.start))
      assert.equal(packet.duration, chunk.count / 48000)
      const expected = new Uint8Array(chunk.count * 4)
      for (let index = 0; index < chunk.count; index++) {
        expected.set(fixture.packet(chunk.start + index), index * 4)
      }
      assert.deepEqual(packet.data, expected)
      const next = await sink.getNextPacket(packet)
      assert.equal(
        next?.timestamp ?? null,
        chunkIndex + 1 < fixture.chunks.length
          ? fixture.timestamp(fixture.chunks[chunkIndex + 1]!.start)
          : null,
      )
    }
  } finally {
    input.dispose()
  }
})

test('keeps size and chunk-offset tables lazy after the first packet', async () => {
  const fixture = await indexedMp4({ samples: 90003, compositionOffsets: [] })
  const input = new Input({ formats: [MP4], source: fixture.source })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    assert.ok(await new EncodedPacketSink(track).getFirstPacket())
    for (const name of ['stsz', 'stco']) {
      const table = fixture.tableRanges.find(table => table.name === name)!
      assert.ok(
        !fixture.requests.some(
          request =>
            request.start >= table.start + 20 + 16 * 1024
            && request.start < table.end,
        ),
        `${name} must not be scanned during initialization`,
      )
    }
  } finally {
    input.dispose()
  }
})

test('clamps inconsistent sample counts to the shortest table', async () => {
  const fixture = await indexedMp4({ samples: 100 })
  const data = new Uint8Array(await fixture.blob().arrayBuffer())
  const sizes = fixture.tableRanges.find(table => table.name === 'stsz')!
  new DataView(data.buffer).setUint32(sizes.start + 16, 66)
  const input = new Input({
    formats: [MP4],
    source: new CustomSource({
      getSize: () => data.length,
      read: (start, end) => data.slice(start, end),
    }),
  })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    const last = await sink.getPacket(Infinity)
    assert.ok(last)
    assert.deepEqual(last.data, fixture.packet(65))
    assert.equal(await sink.getNextPacket(last), null)
  } finally {
    input.dispose()
  }
})

test('rejects invalid table encodings, unsafe prefixes and unsafe offsets', async () => {
  const fixture = await indexedMp4({ samples: 100, fieldSize: 4, co64: true })
  const original = new Uint8Array(await fixture.blob().arrayBuffer())
  for (const [name, offset, value, error] of [
    ['stz2', 12, 3, /Invalid stz2 field size/u],
    ['ctts', 8, 0x0200_0000, /Invalid ctts version/u],
    ['stts', 16, 0xffff_ffff, /Unsafe stts/u],
    ['stsc', 20, 0, /Invalid stsc/u],
    ['stsc', 28, 1, /Invalid stsc/u],
    ['co64', 16, 0x0020_0000, /Unsafe co64/u],
  ] as const) {
    const data = original.slice()
    const table = fixture.tableRanges.find(table => table.name === name)!
    new DataView(data.buffer).setUint32(table.start + offset, value)
    if (name === 'stts') {
      new DataView(data.buffer).setUint32(table.start + 20, 0xffff_ffff)
    }
    const input = new Input({
      formats: [MP4],
      source: new CustomSource({
        getSize: () => data.length,
        read: (start, end) => data.slice(start, end),
      }),
    })
    try {
      await assert.rejects(async () => {
        const track = await input.getPrimaryAudioTrack()
        assert.ok(track)
        await new EncodedPacketSink(track).getFirstPacket()
      }, error)
    } finally {
      input.dispose()
    }
  }
})

test('accepts large chunk runs and composition offsets without multiplying them as decode time', async () => {
  const fixture = await indexedMp4({ samples: 100 })
  const data = new Uint8Array(await fixture.blob().arrayBuffer())
  const view = new DataView(data.buffer)
  const chunks = fixture.tableRanges.find(table => table.name === 'stsc')!
  const composition = fixture.tableRanges.find(table => table.name === 'ctts')!
  view.setUint32(chunks.start + 20, 1_000_000_000)
  view.setUint32(composition.start + 16, 1_000_000_000)
  view.setUint32(composition.start + 20, 1_000_000_000)
  const input = new Input({
    formats: [MP4],
    source: new CustomSource({
      getSize: () => data.length,
      read: (start, end) => data.slice(start, end),
    }),
  })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    for (const index of [0, 99, 1]) {
      const packet = await sink.getPacket(
        (index * 1024 + 1_000_000_000) / 48000,
      )
      assert.ok(packet)
      assert.deepEqual(packet.data, fixture.packet(index))
      assert.equal(packet.duration, 1024 / 48000)
    }
  } finally {
    input.dispose()
  }
})
