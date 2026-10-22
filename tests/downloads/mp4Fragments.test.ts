import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { EncodedPacketSink, Input, MP4 } from 'mediabunny'
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
      const samples = [3, 1069, 600, 7, 1068, 200]
      const packets = await Promise.all(
        samples.map(index => sinks[1]!.getPacket(fixture.timestamp(index))),
      )
      for (const [at, index] of samples.entries()) {
        assert.equal(packets[at]?.timestamp, fixture.timestamp(index))
        assert.deepEqual(packets[at]?.data, fixture.packet(2, index))
      }
      assert.equal(await sinks[1]!.getNextPacket(packets[4]!), null)
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
    const input = new library.Input({
      formats: [library.MP4],
      source: new library.BlobSource(fixture.blob(), {
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
    } finally {
      input.dispose()
    }
  })
}
