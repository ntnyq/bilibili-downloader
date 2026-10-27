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
import { testFragmentIndex } from '../fixtures/downloads/fragmentIndex'
import { testFragmentSamples } from '../fixtures/downloads/fragmentSamples'
import { videoPackets } from '../fixtures/downloads/mp4FragmentMedia'
import { generateStoredSamples } from '../fixtures/downloads/mp4FragmentSamples'
import { audioPacket } from '../fixtures/downloads/mp4OutputIndex'

for (const real of [true, false]) {
  test(`preserves complete fragmented output with ${real ? 'real B frames' : 'externally sorted GOPs, ties and zero durations'}`, async context => {
    context.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) })
    const store = await testFragmentSamples(context)
    const count = real ? 96 : 5003
    const bytes = await generateStoredSamples(
      store,
      await testFragmentIndex(context),
      mediabunny,
      count,
      real,
    )
    const legacy = await generateStoredSamples(
      undefined,
      await testFragmentIndex(context),
      mediabunny,
      count,
      real,
    )
    assert.deepEqual(bytes, legacy)
    const input = new mediabunny.Input({
      formats: [mediabunny.MP4],
      source: new mediabunny.BlobSource(new Blob([bytes])),
    })
    try {
      const track = await input.getPrimaryVideoTrack()
      assert.ok(track)
      let packets = 0
      for await (const packet of new mediabunny.EncodedPacketSink(
        track,
      ).packets()) {
        if (!real) {
          assert.ok(packet.duration >= 0)
        }
        packets++
      }
      assert.equal(packets, 3 * count)
      const sink = new mediabunny.EncodedPacketSink(track)
      for (const second of real
        ? [10, 1, 6, 0]
        : [(count / 24) * 2 + 1, 1, count / 24 + 1]) {
        const key = await sink.getKeyPacket(second)
        assert.ok(key)
        assert.equal(key.type, 'key')
      }
    } finally {
      input.dispose()
    }
  })
}

for (const browser of [false, true]) {
  test(`uses paged sample metadata in the ${browser ? 'browser' : 'Node'} CommonJS bundle`, async context => {
    context.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) })
    const require = createRequire(import.meta.url)
    const path = require.resolve('mediabunny')
    const library: typeof mediabunny = require(
      browser ? path.replace('.node.cjs', '.cjs') : path,
    )
    const bytes = await generateStoredSamples(
      await testFragmentSamples(context),
      await testFragmentIndex(context),
      library,
    )
    assert.deepEqual(
      bytes,
      await generateStoredSamples(undefined, await testFragmentIndex(context)),
    )
  })
}

for (const operation of [
  'append',
  'get',
  'set',
  'sort',
  'sorted',
  'readMedia',
  'release',
] as const) {
  test(`propagates descriptor ${operation} failures without deadlocking track close`, async context => {
    const store = await testFragmentSamples(context)
    const failure = new DOMException('disk full', 'QuotaExceededError')
    const failing = {
      ...store,
      async [operation]() {
        throw failure
      },
    }
    await assert.rejects(
      generateStoredSamples(failing, await testFragmentIndex(context)),
      error => error === failure,
    )
  })
}

test('awaits external sort backpressure before publishing a fragment', async context => {
  const store = await testFragmentSamples(context)
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  let complete = false
  const generating = generateStoredSamples(
    {
      ...store,
      async sort(track, start, count) {
        entered.resolve()
        await gate.promise
        await store.sort(track, start, count)
      },
    },
    await testFragmentIndex(context),
  ).then(() => {
    complete = true
  })
  await entered.promise
  assert.equal(complete, false)
  gate.resolve()
  await generating
  assert.equal(complete, true)
})

test('pages queued descriptors and media when an entire track arrives before another', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 0, 1) })
  const { config } = await videoPackets()
  const { config: audioConfig, packet } = await audioPacket()
  const generate = async (bounded: boolean) => {
    const target = new mediabunny.BufferTarget()
    const output = new mediabunny.Output({
      format: new mediabunny.Mp4OutputFormat({
        fastStart: 'fragmented',
        minimumFragmentDuration: 2,
        _fragmentIndexStore: await testFragmentIndex(context),
        _fragmentSampleStore: bounded
          ? await testFragmentSamples(context)
          : undefined,
      }),
      target,
    })
    const video = new mediabunny.EncodedVideoPacketSource('avc')
    const audio = new mediabunny.EncodedAudioPacketSource('aac')
    output.addVideoTrack(video, { decoderConfig: config })
    output.addAudioTrack(audio, { decoderConfig: audioConfig })
    await output.start()
    for (let at = 0; at < 10003; at++) {
      await video.add(
        new mediabunny.EncodedPacket(
          Uint8Array.of(at % 251),
          at % 5003 === 0 ? 'key' : 'delta',
          at / 24,
          1 / 24,
        ),
        { decoderConfig: config },
      )
    }
    video.close()
    for (let at = 0; at < 37; at++) {
      await audio.add(
        new mediabunny.EncodedPacket(packet.data, 'key', at / 24, 1 / 24),
        { decoderConfig: audioConfig },
      )
    }
    audio.close()
    await output.finalize()
    assert.ok(target.buffer)
    const buffer = target.buffer
    return new Uint8Array(buffer, 0, buffer.byteLength)
  }
  assert.deepEqual(await generate(true), await generate(false))
})

test('bounds GOP metadata heap and buffers while appending, sorting and writing trun', async () => {
  const measurements = []
  for (const count of [20000, 400000]) {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--expose-gc',
        '--import',
        'tsx',
        fileURLToPath(
          new URL(
            '../fixtures/downloads/mp4FragmentSamplesMemory.ts',
            import.meta.url,
          ),
        ),
        String(count),
      ],
      { timeout: 120000 },
    )
    const measurement: unknown = JSON.parse(stdout)
    assert.ok(measurement && typeof measurement === 'object')
    const heap: unknown = Reflect.get(measurement, 'retainedHeapBytes')
    const buffers: unknown = Reflect.get(measurement, 'retainedBufferBytes')
    assert.equal(typeof heap, 'number')
    assert.equal(typeof buffers, 'number')
    if (typeof heap !== 'number' || typeof buffers !== 'number') {
      throw new TypeError('Missing metadata memory measurements')
    }
    measurements.push({ heap, buffers })
  }
  assert.ok(measurements[1]!.heap - measurements[0]!.heap < 2 * 1024 * 1024)
  assert.ok(measurements[1]!.buffers - measurements[0]!.buffers < 512 * 1024)
})

for (const entry of ['esm', 'node', 'browser'] as const) {
  test(`streams paged metadata with large MDAT and absolute track offsets in ${entry}`, async context => {
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
    const backing = await testFragmentSamples(context)
    const output = new library.Output({
      format: new library.Mp4OutputFormat({
        fastStart: 'fragmented',
        minimumFragmentDuration: 2,
        _fragmentIndexStore: await testFragmentIndex(context),
        _fragmentSampleStore: {
          ...backing,
          async get(track, id) {
            const row = await backing.get(track, id)
            return track === 1 && id < 2 ? { ...row, size: 2 ** 31 } : row
          },
          async readMedia(_track, _offset, length) {
            assert.ok(length <= 65536)
            return page.subarray(0, length)
          },
          async release(track, before) {
            reset++
            await backing.release(track, before)
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
    // Virtual payload pages and two large descriptor sizes exercise >4 GiB
    // without allocating a giant packet or retaining a full metadata array.
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

test('honors cancellation after GOP sorting and closes the incomplete output', async context => {
  const samples = await testFragmentSamples(context)
  const controller = new AbortController()
  const video = await readFile(
    new URL('../fixtures/downloads/long-gop.mp4', import.meta.url),
  )
  const audio = await readFile(
    new URL('../fixtures/downloads/audio.m4a', import.meta.url),
  )
  await assert.rejects(
    remuxMedia(
      'dash',
      [new Blob([video]), new Blob([audio])],
      new WritableStream({ write() {} }),
      controller.signal,
      await testFragmentIndex(context),
      {
        ...samples,
        async sort(track, start, count) {
          await samples.sort(track, start, count)
          controller.abort()
        },
      },
    ),
    { name: 'AbortError' },
  )
})
