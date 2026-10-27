import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import * as mediabunny from 'mediabunny'
import { remuxMedia } from '../../utils/downloads/remuxMedia'
import {
  testFragmentIndex,
  testFragmentMedia,
} from '../fixtures/downloads/fragmentIndex'
import { testFragmentSamples } from '../fixtures/downloads/fragmentSamples'
import {
  generateGops,
  videoPackets,
} from '../fixtures/downloads/mp4FragmentMedia'
import { audioPacket } from '../fixtures/downloads/mp4OutputIndex'

async function packets(bytes: Uint8Array<ArrayBuffer>) {
  const input = new mediabunny.Input({
    formats: [mediabunny.MP4],
    source: new mediabunny.BlobSource(new Blob([bytes])),
  })
  try {
    const track = await input.getPrimaryVideoTrack()
    assert.ok(track)
    const result = []
    for await (const packet of new mediabunny.EncodedPacketSink(
      track,
    ).packets()) {
      result.push({
        data: packet.data,
        type: packet.type,
        timestamp: packet.timestamp,
        duration: packet.duration,
      })
    }
    return result
  } finally {
    input.dispose()
  }
}

test('preserves complete MP4 bytes and B-frame seeking while reusing GOP media spools', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) })
  const media = await testFragmentMedia(context)
  const sizes: number[] = []
  const resets: number[] = []
  let pending = 0
  const bytes = await generateGops({
    async append(trackId, data) {
      assert.equal(++pending, 1)
      try {
        await media.append(trackId, data)
      } finally {
        pending--
      }
    },
    async read(trackId, offset, length) {
      assert.equal(++pending, 1)
      sizes.push(length)
      try {
        return await media.read(trackId, offset, length)
      } finally {
        pending--
      }
    },
    async reset(trackId) {
      resets.push(trackId)
      await media.reset(trackId)
    },
  })
  const legacy = await generateGops(undefined)
  assert.deepEqual(bytes, legacy)
  assert.deepEqual(await packets(bytes), await packets(legacy))
  assert.deepEqual(resets, [1, 1, 1])
  assert.ok(sizes.every(length => length <= 65536))
  const input = new mediabunny.Input({
    formats: [mediabunny.MP4],
    source: new mediabunny.BlobSource(new Blob([bytes])),
  })
  try {
    const track = await input.getPrimaryVideoTrack()
    assert.ok(track)
    const sink = new mediabunny.EncodedPacketSink(track)
    for (const timestamp of [10, 1, 6, 0, 11]) {
      assert.equal(
        (await sink.getKeyPacket(timestamp))?.timestamp,
        Math.floor(timestamp / 4) * 4,
      )
    }
  } finally {
    input.dispose()
  }
})

for (const browser of [false, true]) {
  test(`spools media in the ${browser ? 'browser' : 'Node'} CommonJS bundle`, async context => {
    context.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) })
    const require = createRequire(import.meta.url)
    const path = require.resolve('mediabunny')
    const library: typeof mediabunny = require(
      browser ? path.replace('.node.cjs', '.cjs') : path,
    )
    assert.deepEqual(
      await generateGops(await testFragmentMedia(context), library),
      await generateGops(undefined),
    )
  })
}

for (const operation of ['append', 'read', 'reset', 'short-read'] as const) {
  test(`propagates media ${operation} failures`, async context => {
    const media = await testFragmentMedia(context)
    const failure = new DOMException('disk full', 'QuotaExceededError')
    await assert.rejects(
      generateGops({
        append:
          operation === 'append'
            ? async () => {
                throw failure
              }
            : media.append,
        read:
          operation === 'read'
            ? async () => {
                throw failure
              }
            : operation === 'short-read'
              ? async () => new Uint8Array(0)
              : media.read,
        reset:
          operation === 'reset'
            ? async () => {
                throw failure
              }
            : media.reset,
      }),
      error =>
        operation === 'short-read'
          ? error instanceof RangeError
          : error === failure,
    )
  })
}

for (const phase of ['append', 'read'] as const) {
  test(`honors media ${phase} backpressure`, async context => {
    const media = await testFragmentMedia(context)
    const gate = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    let finished = false
    const pause = async () => {
      entered.resolve()
      await gate.promise
    }
    const pending = generateGops(
      {
        reset: media.reset,
        async append(trackId, data) {
          if (phase === 'append') {
            await pause()
          }
          await media.append(trackId, data)
        },
        async read(trackId, offset, length) {
          if (phase === 'read') {
            await pause()
          }
          return media.read(trackId, offset, length)
        },
      },
      mediabunny,
      1,
    ).then(() => {
      finished = true
    })
    await entered.promise
    assert.equal(finished, false)
    gate.resolve()
    await pending
    assert.equal(finished, true)
  })
}

for (const phase of ['append', 'read'] as const) {
  test(`honors cancellation during media ${phase}`, async context => {
    const media = await testFragmentSamples(context)
    const controller = new AbortController()
    const source = await readFile(
      new URL('../fixtures/downloads/long-gop.mp4', import.meta.url),
    )
    const audio = await readFile(
      new URL('../fixtures/downloads/audio.m4a', import.meta.url),
    )
    await assert.rejects(
      remuxMedia(
        'dash',
        [new Blob([source]), new Blob([audio])],
        new WritableStream({ write() {} }),
        controller.signal,
        await testFragmentIndex(context),
        {
          ...media,
          async append(trackId, sample, data) {
            const id = await media.append(trackId, sample, data)
            if (phase === 'append') {
              controller.abort()
            }
            return id
          },
          async readMedia(trackId, offset, length) {
            const data = await media.readMedia(trackId, offset, length)
            if (phase === 'read') {
              controller.abort()
            }
            return data
          },
        },
      ),
      { name: 'AbortError' },
    )
  })
}

test('spools video after the shorter audio track ends without changing packets', async context => {
  const video = await readFile(
    new URL('../fixtures/downloads/long-gop.mp4', import.meta.url),
  )
  const audio = await readFile(
    new URL('../fixtures/downloads/audio.m4a', import.meta.url),
  )
  // Production remuxing writes positioned chunks. Keep this small fixture in a
  // target solely to compare the resulting video packets and timing.
  const parts: { data: Uint8Array; position: number }[] = []
  await remuxMedia(
    'dash',
    [new Blob([video]), new Blob([audio])],
    new WritableStream({
      write({ data, position }) {
        parts.push({ data: data.slice(), position })
      },
    }),
    new AbortController().signal,
    await testFragmentIndex(context),
    await testFragmentSamples(context),
  )
  const length = Math.max(
    ...parts.map(part => part.position + part.data.length),
  )
  const bytes = new Uint8Array(length)
  for (const part of parts) {
    bytes.set(part.data, part.position)
  }
  assert.deepEqual(await packets(bytes), await packets(video))
})

for (const entry of ['esm', 'node', 'browser'] as const) {
  test(`writes large MDAT sizes and absolute track offsets in ${entry}`, async () => {
    const require = createRequire(import.meta.url)
    const path = require.resolve('mediabunny')
    const library: typeof mediabunny =
      entry === 'esm'
        ? mediabunny
        : require(
            entry === 'browser' ? path.replace('.node.cjs', '.cjs') : path,
          )

    const { config } = await videoPackets()
    class SparseTarget extends library.NullTarget {
      head = new Uint8Array(65536)
      end = 0
      _write(data: Uint8Array, position: number) {
        if (position < this.head.length) {
          this.head.set(data.subarray(0, this.head.length - position), position)
        }
        this.end = Math.max(this.end, position + data.length)
      }
    }
    const target = new SparseTarget()
    const page = new Uint8Array(65536)
    let reset = 0
    const output = new library.Output({
      format: new library.Mp4OutputFormat({
        fastStart: 'fragmented',
        minimumFragmentDuration: 2,
        _fragmentMediaStore: {
          async append() {},
          async read(_track, _offset, length) {
            assert.ok(length <= 65536)
            return page.subarray(0, length)
          },
          async reset() {
            reset++
          },
        },
      }),
      target,
    })
    const source = new library.EncodedVideoPacketSource('avc')
    output.addVideoTrack(source, { decoderConfig: config })
    const audio = new library.EncodedAudioPacketSource('aac')
    const { config: audioConfig } = await audioPacket()
    output.addAudioTrack(audio, { decoderConfig: audioConfig })
    await output.start()
    for (let at = 0; at < 3; at++) {
      await source.add(
        new library.EncodedPacket(
          Uint8Array.of(0),
          at === 0 ? 'key' : 'delta',
          at,
          1,
        ),
        { decoderConfig: config },
      )
      await audio.add(
        new library.EncodedPacket(Uint8Array.of(0), 'key', at, 1),
        { decoderConfig: audioConfig },
      )
    }
    // Model two very large samples with a sparse discard target and virtual media
    // pages, rather than allocating a multi-gigabyte packet or fixture file.
    const muxer: unknown = Reflect.get(output, '_muxer')
    assert.ok(muxer && typeof muxer === 'object')
    const tracks: unknown = Reflect.get(muxer, 'trackDatas')
    assert.ok(Array.isArray(tracks))
    const chunk: unknown = Reflect.get(tracks[0], 'currentChunk')
    assert.ok(chunk && typeof chunk === 'object')
    const samples: unknown = Reflect.get(chunk, 'samples')
    assert.ok(Array.isArray(samples))
    assert.equal(samples.length, 3)
    for (const sample of samples.slice(0, 2)) {
      Reflect.set(sample, 'size', 2 ** 31)
    }
    source.close()
    audio.close()
    await output.finalize()
    const view = new DataView(target.head.buffer)
    let offset = 0
    while (
      new TextDecoder().decode(target.head.subarray(offset + 4, offset + 8))
      !== 'mdat'
    ) {
      const size = view.getUint32(offset)
      assert.ok(size >= 8 && offset + size < target.head.length)
      offset += size
    }
    assert.equal(view.getUint32(offset), 1)
    const declared = view.getBigUint64(offset + 8)
    assert.equal(declared, 2n ** 32n + 4n + 16n)
    // Two tracks with one entry each produce a 128-byte final MFRA.
    assert.equal(BigInt(target.end - 128), BigInt(offset) + declared)
    assert.equal(reset, 2)
    let moof = 0
    while (
      new TextDecoder().decode(target.head.subarray(moof + 4, moof + 8))
      !== 'moof'
    ) {
      moof += view.getUint32(moof)
    }
    const children = (start: number, end: number, type: string) => {
      const found = []
      for (let at = start; at < end; at += view.getUint32(at)) {
        assert.ok(view.getUint32(at) >= 8)
        if (
          new TextDecoder().decode(target.head.subarray(at + 4, at + 8))
          === type
        ) {
          found.push(at)
        }
      }
      return found
    }
    const traf = children(moof + 8, moof + view.getUint32(moof), 'traf')[1]!
    const tfhd = children(traf + 8, traf + view.getUint32(traf), 'tfhd')[0]!
    const trun = children(traf + 8, traf + view.getUint32(traf), 'trun')[0]!
    assert.ok(view.getUint32(tfhd + 8) & 1)
    assert.equal(view.getUint32(tfhd + 8) & 0x20000, 0)
    assert.equal(
      view.getBigUint64(tfhd + 16),
      BigInt(offset + 16) + 2n ** 32n + 1n,
    )
    assert.equal(view.getInt32(trun + 16), 0)
  })
}

test('rejects media spools with incompatible output modes or whole-mdat callbacks', () => {
  const store = {
    async append() {},
    async read() {
      return new Uint8Array(0)
    },
    async reset() {},
  }
  for (const options of [
    { fastStart: false, _fragmentMediaStore: store },
    { fastStart: 'fragmented', _fragmentMediaStore: store, onMdat() {} },
    {
      fastStart: 'fragmented',
      _fragmentMediaStore: { append: store.append, read: store.read },
    },
  ]) {
    assert.throws(
      () => Reflect.construct(mediabunny.Mp4OutputFormat, [options]),
      TypeError,
    )
  }
})

test('bounds long-GOP payload buffers while writing and draining the fragment', async () => {
  const measurements = []
  for (const count of [2048, 8192]) {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--expose-gc',
        '--import',
        'tsx',
        fileURLToPath(
          new URL(
            '../fixtures/downloads/mp4FragmentMediaMemory.ts',
            import.meta.url,
          ),
        ),
        String(count),
      ],
      { timeout: 60000 },
    )
    const measurement: unknown = JSON.parse(stdout)
    assert.ok(measurement && typeof measurement === 'object')
    const buffers: unknown = Reflect.get(measurement, 'retainedBufferBytes')
    assert.equal(typeof buffers, 'number')
    if (typeof buffers !== 'number') {
      throw new TypeError('Missing buffer measurements')
    }
    measurements.push(buffers)
  }
  assert.ok(measurements[1]! - measurements[0]! < 512 * 1024)
})

test('copies small samples out of large input backing buffers', async () => {
  await promisify(execFile)(
    process.execPath,
    [
      '--expose-gc',
      '--import',
      'tsx',
      fileURLToPath(
        new URL(
          '../fixtures/downloads/mp4FragmentMediaMemory.ts',
          import.meta.url,
        ),
      ),
      '128',
      'wide-backing',
    ],
    { timeout: 60000 },
  )
})
