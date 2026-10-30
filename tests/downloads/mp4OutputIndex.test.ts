import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import * as mediabunny from 'mediabunny'
import { remuxMedia } from '../../utils/downloads/media/remuxMedia'
import { testFragmentIndex } from '../fixtures/downloads/fragmentIndex'
import { testFragmentSamples } from '../fixtures/downloads/fragmentSamples'
import {
  audioPacket,
  fragmentIndex,
} from '../fixtures/downloads/mp4OutputIndex'
import type { FragmentIndexStore } from '../../utils/downloads/media/fragments/fragmentIndex'

async function generate(
  fragments: number,
  store?: FragmentIndexStore,
  library = mediabunny,
  extraTrack = false,
  step = 2,
) {
  const { packet, config } = await audioPacket()
  const target = new library.BufferTarget()
  const output = new library.Output({
    format: new library.Mp4OutputFormat({
      fastStart: 'fragmented',
      minimumFragmentDuration: 2,
      _fragmentIndexStore: store,
    }),
    target,
  })
  const source = new library.EncodedAudioPacketSource('aac')
  output.addAudioTrack(source, { decoderConfig: config })
  const second = extraTrack
    ? new library.EncodedAudioPacketSource('aac')
    : undefined
  if (second) {
    output.addAudioTrack(second, { decoderConfig: config })
  }
  await output.start()
  for (let at = 0; at < fragments; at++) {
    await source.add(
      new library.EncodedPacket(packet.data, 'key', at * step, 2),
      {
        decoderConfig: config,
      },
    )
    if (second && at < 7) {
      await second.add(
        new library.EncodedPacket(packet.data, 'key', at * 2, 2),
        { decoderConfig: config },
      )
      if (at === 6) {
        second.close()
      }
    }
  }
  source.close()
  await output.finalize()
  assert.ok(target.buffer)
  const buffer = target.buffer
  return new Uint8Array(buffer, 0, buffer.byteLength)
}

test('streams byte-identical TFRA records across page boundaries and early track endings', async context => {
  const store = await testFragmentIndex(context)
  let pending = 0
  const reads: number[] = []
  const spooled = await generate(
    3005,
    {
      async append(trackId, data) {
        assert.equal(++pending, 1)
        try {
          await store.append(trackId, data)
        } finally {
          pending--
        }
      },
      async read(trackId, offset, length) {
        assert.equal(++pending, 1)
        reads.push(length)
        try {
          return await store.read(trackId, offset, length)
        } finally {
          pending--
        }
      },
    },
    mediabunny,
    true,
  )
  const legacy = await generate(3005, undefined, mediabunny, true)
  assert.deepEqual(fragmentIndex(spooled), fragmentIndex(legacy))
  assert.ok(reads.includes(65536))
  assert.ok(reads.every(length => length <= 65536))
  const index = fragmentIndex(spooled)
  const view = new DataView(index.buffer, index.byteOffset)
  assert.equal(view.getUint32(8 + 24 + 24), 1)
  const input = new mediabunny.Input({
    formats: [mediabunny.MP4],
    source: new mediabunny.BlobSource(new Blob([spooled])),
  })
  try {
    const tracks = await input.getAudioTracks()
    assert.equal(tracks.length, 2)
    const sink = new mediabunny.EncodedPacketSink(tracks[0]!)
    for (const second of [6008, 0, 3200, 16]) {
      assert.equal((await sink.getKeyPacket(second + 0.1))?.timestamp, second)
    }
    const early = new mediabunny.EncodedPacketSink(tracks[1]!)
    assert.equal((await early.getKeyPacket(6000))?.timestamp, 12)
  } finally {
    input.dispose()
  }
})

test('keeps 64-bit TFRA timestamps without narrowing them to 32 bits', async context => {
  const bytes = await generate(
    3,
    await testFragmentIndex(context),
    mediabunny,
    false,
    100000,
  )
  assert.deepEqual(
    fragmentIndex(bytes),
    fragmentIndex(await generate(3, undefined, mediabunny, false, 100000)),
  )
  const index = fragmentIndex(bytes)
  const view = new DataView(index.buffer, index.byteOffset, index.byteLength)
  assert.ok(view.getBigUint64(8 + 24 + 28) > 0xffff_ffffn)
})

test('keeps 64-bit fragment offsets when the sparse output passes 4 GiB', async context => {
  const store = await testFragmentIndex(context)
  const { packet, config } = await audioPacket()
  const offsets: number[] = []
  const entries: Uint8Array[] = []
  const output = new mediabunny.Output({
    format: new mediabunny.Mp4OutputFormat({
      fastStart: 'fragmented',
      minimumFragmentDuration: 2,
      onMoof(_data, position) {
        offsets.push(position)
      },
      _fragmentIndexStore: {
        async append(trackId, data) {
          entries.push(data.slice())
          await store.append(trackId, data)
        },
        read: store.read,
      },
    }),
    // NullTarget accepts sparse positions without filling the gap with zeros.
    target: new mediabunny.NullTarget(),
  })
  const source = new mediabunny.EncodedAudioPacketSource('aac')
  output.addAudioTrack(source, { decoderConfig: config })
  await output.start()
  await source.add(new mediabunny.EncodedPacket(packet.data, 'key', 0, 2), {
    decoderConfig: config,
  })
  await source.add(new mediabunny.EncodedPacket(packet.data, 'key', 2, 2), {
    decoderConfig: config,
  })
  // Seek the internal positioned writer over a sparse gap, without allocating
  // or writing 4 GiB of fixture media. Fragment generation itself stays real.
  const muxer: unknown = Reflect.get(output, '_muxer')
  assert.ok(muxer && typeof muxer === 'object')
  const writer: unknown = Reflect.get(muxer, 'writer')
  assert.ok(writer && typeof writer === 'object')
  const seek: unknown = Reflect.get(writer, 'seek')
  assert.equal(typeof seek, 'function')
  if (typeof seek !== 'function') {
    throw new TypeError('Missing positioned writer')
  }
  Reflect.apply(seek, writer, [2 ** 32 + 4096])
  source.close()
  await output.finalize()
  assert.equal(entries.length, offsets.length)
  assert.ok(offsets.some(offset => offset > 2 ** 32))
  for (const [at, entry] of entries.entries()) {
    assert.equal(
      new DataView(
        entry.buffer,
        entry.byteOffset,
        entry.byteLength,
      ).getBigUint64(8),
      BigInt(offsets[at]!),
    )
  }
})

for (const browser of [false, true]) {
  test(`spools output indexes in the ${browser ? 'browser' : 'Node'} CommonJS bundle`, async context => {
    const require = createRequire(import.meta.url)
    const path = require.resolve('mediabunny')
    const library: typeof mediabunny = require(
      browser ? path.replace('.node.cjs', '.cjs') : path,
    )
    assert.deepEqual(
      fragmentIndex(
        await generate(17, await testFragmentIndex(context), library),
      ),
      fragmentIndex(await generate(17)),
    )
  })
}

for (const failure of ['append', 'read', 'short-read'] as const) {
  test(`propagates ${failure} index errors without publishing output`, async context => {
    const store = await testFragmentIndex(context)
    const diskError = new DOMException('disk full', 'QuotaExceededError')
    await assert.rejects(
      generate(3, {
        append:
          failure === 'append'
            ? async () => {
                throw diskError
              }
            : store.append,
        read:
          failure === 'read'
            ? async () => {
                throw diskError
              }
            : failure === 'short-read'
              ? async () => new Uint8Array(0)
              : store.read,
      }),
      error =>
        failure === 'short-read'
          ? error instanceof RangeError
          : error === diskError,
    )
  })
}

test('honors cancellation while reading the final output index', async context => {
  const store = await testFragmentIndex(context)
  const controller = new AbortController()
  const bytes = await generate(4)
  let closed = false
  await assert.rejects(
    remuxMedia(
      'audio',
      [new Blob([bytes])],
      new WritableStream({
        close() {
          closed = true
        },
      }),
      controller.signal,
      {
        append: store.append,
        async read(trackId, offset, length) {
          const page = await store.read(trackId, offset, length)
          controller.abort()
          return page
        },
      },
      await testFragmentSamples(context),
    ),
    { name: 'AbortError' },
  )
  // Cancellation closes the target; the caller removes its unfinished job directory.
  assert.equal(closed, true)
})

test('bounds retained output indexes and finalization buffers independently of fragment count', async () => {
  const measurements = []
  for (const count of [2000, 100000]) {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--expose-gc',
        '--import',
        'tsx',
        fileURLToPath(
          new URL(
            '../fixtures/downloads/mp4OutputIndexMemory.ts',
            import.meta.url,
          ),
        ),
        String(count),
      ],
      { timeout: 60000 },
    )
    const measurement: unknown = JSON.parse(stdout)
    assert.ok(measurement && typeof measurement === 'object')
    const heap: unknown = Reflect.get(measurement, 'retainedHeapBytes')
    const buffers: unknown = Reflect.get(measurement, 'retainedBufferBytes')
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
