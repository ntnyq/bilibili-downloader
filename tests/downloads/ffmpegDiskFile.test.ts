import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BlobSource, EncodedPacketSink, Input, MP4 } from 'mediabunny'
import { createFFmpegDiskFile } from '../../utils/downloads/media/ffmpegDiskFile'
import {
  loadFFmpegCore,
  runProgressiveFFmpeg,
} from '../../utils/downloads/media/progressiveMedia'
import type { TestContext } from 'node:test'
import type { DiskAccess } from '../../utils/downloads/media/ffmpegDiskFile'

class SparseDisk implements DiskAccess {
  size = 0
  chunks: { at: number; data: Uint8Array<ArrayBuffer> }[] = []
  maxWrite = Infinity
  failure: Error | undefined

  read(buffer: Uint8Array, { at }: { at: number }) {
    const length = Math.max(0, Math.min(buffer.byteLength, this.size - at))
    buffer.fill(0)
    for (const chunk of this.chunks) {
      const start = Math.max(at, chunk.at)
      const end = Math.min(at + length, chunk.at + chunk.data.byteLength)
      if (start < end) {
        buffer.set(
          chunk.data.subarray(start - chunk.at, end - chunk.at),
          start - at,
        )
      }
    }
    return length
  }

  write(buffer: Uint8Array, { at }: { at: number }) {
    if (this.failure) {
      throw this.failure
    }
    const length = Math.min(buffer.byteLength, this.maxWrite)
    this.chunks.push({ at, data: new Uint8Array(buffer.subarray(0, length)) })
    this.size = Math.max(this.size, at + length)
    return length
  }

  getSize() {
    return this.size
  }

  truncate(size: number) {
    this.size = size
    this.chunks = this.chunks
      .filter(chunk => chunk.at < size)
      .map(chunk => ({
        at: chunk.at,
        data: chunk.data.slice(0, size - chunk.at),
      }))
  }

  blob() {
    const bytes = new Uint8Array(this.size)
    this.read(bytes, { at: 0 })
    return new Blob([bytes])
  }
}

async function createCore(context: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'self')
  Object.defineProperty(globalThis, 'self', {
    configurable: true,
    value: { location: { href: import.meta.resolve('@ffmpeg/core') } },
  })
  context.after(() => {
    if (previous) {
      Object.defineProperty(globalThis, 'self', previous)
    } else {
      Reflect.deleteProperty(globalThis, 'self')
    }
  })
  return loadFFmpegCore(import.meta.resolve('@ffmpeg/core'), {
    wasmBinary: await readFile(
      new URL(import.meta.resolve('@ffmpeg/core/wasm')),
    ),
  })
}

async function packetData(blob: Blob, kind: 'video' | 'audio') {
  const input = new Input({ formats: [MP4], source: new BlobSource(blob) })
  try {
    const track =
      kind === 'video'
        ? await input.getPrimaryVideoTrack()
        : await input.getPrimaryAudioTrack()
    assert.ok(track)
    const packets = []
    for await (const packet of new EncodedPacketSink(track).packets()) {
      const hash = createHash('sha256')
      if (kind === 'video') {
        // FFmpeg concat can repeat SPS/PPS at keyframes without changing any
        // encoded picture. Compare every other NAL, in original decode order.
        const view = new DataView(
          packet.data.buffer,
          packet.data.byteOffset,
          packet.data.byteLength,
        )
        for (let offset = 0; offset + 4 <= packet.data.length;) {
          const length = view.getUint32(offset)
          const nal = packet.data.subarray(offset + 4, offset + 4 + length)
          assert.equal(nal.length, length)
          if (![7, 8].includes(nal[0]! & 0x1f)) {
            hash.update(nal)
          }
          offset += 4 + length
        }
      } else {
        hash.update(packet.data)
      }
      packets.push({ hash: hash.digest('hex'), timestamp: packet.timestamp })
    }
    return packets
  } finally {
    input.dispose()
  }
}

test('the real WASM filesystem can seek past 4 GiB, retry partial writes and truncate without media allocation', async context => {
  const core = await createCore(context)
  const disk = new SparseDisk()
  disk.maxWrite = 2
  const node = core.FS.create('/large.mp4')
  // Capture the actual attached node without exposing test-only runtime APIs.
  const fs = { ...core.FS, create: () => node }
  const file = createFFmpegDiskFile(fs, '/large.mp4', disk, () => {})
  const offset = 5 * 1024 ** 3
  const stream = { position: 0 }
  assert.equal(node.stream_ops.llseek(stream, offset, 0), offset)
  assert.equal(
    node.stream_ops.write(stream, new Uint8Array([1, 2, 3, 4]), 0, 4, offset),
    4,
  )
  assert.equal(disk.size, offset + 4)
  assert.equal(Reflect.get(node, 'contents'), null)
  assert.equal(Reflect.get(node, 'usedBytes'), 0)
  assert.equal(node.node_ops.getattr(node).size, offset + 4)
  const bytes = new Uint8Array(4)
  assert.equal(node.stream_ops.read(stream, bytes, 0, 4, offset), 4)
  assert.deepEqual([...bytes], [1, 2, 3, 4])
  assert.equal(node.stream_ops.llseek(stream, -4, 2), offset)
  node.node_ops.setattr(node, { size: 0 })
  assert.equal(disk.size, 0)
  assert.equal(file.getError(), undefined)
  assert.ok(!('mmap' in node.stream_ops))
})

test('preserves disk quota errors instead of returning a truncated successful MP4', async context => {
  const core = await createCore(context)
  const disk = new SparseDisk()
  disk.failure = new DOMException('disk full', 'QuotaExceededError')
  const node = core.FS.create('/failed.mp4')
  const file = createFFmpegDiskFile(
    { ...core.FS, create: () => node },
    '/failed.mp4',
    disk,
    () => {},
  )
  assert.throws(
    () => node.stream_ops.write({ position: 0 }, new Uint8Array([1]), 0, 1, 0),
    { name: 'ErrnoError' },
  )
  assert.equal(file.getError(), disk.failure)
})

for (const format of ['flv', 'mp4']) {
  test(`real FFmpeg WASM concatenates progressive ${format} segments through the disk adapter`, async context => {
    const core = await createCore(context)
    const bytes = await readFile(
      new URL(`../fixtures/downloads/progressive.${format}`, import.meta.url),
    )
    const reference = new Blob([
      await readFile(
        new URL('../fixtures/downloads/progressive.mp4', import.meta.url),
      ),
    ])
    core.FS.mkdir('/inputs')
    core.FS.writeFile('/inputs/0.media', bytes)
    core.FS.writeFile('/inputs/1.media', bytes)
    const disk = new SparseDisk()
    const timeout = context.mock.method(core, 'setTimeout')
    runProgressiveFFmpeg(core, disk, 2, () => {})
    assert.deepEqual(
      timeout.mock.calls.map(call => call.arguments),
      [[-1]],
    )
    const segmentOffsets: number[] = []
    const trackOffsets: number[] = []
    for (const kind of ['video', 'audio'] as const) {
      const actual = await packetData(disk.blob(), kind)
      const original = await packetData(reference, kind)
      assert.deepEqual(
        actual.map(packet => packet.hash),
        [...original, ...original].map(packet => packet.hash),
      )
      const starts = actual.filter((_, index) => index % original.length === 0)
      assert.ok(starts[1]!.timestamp > starts[0]!.timestamp + 1.7)
      segmentOffsets.push(starts[1]!.timestamp - starts[0]!.timestamp)
      trackOffsets.push(actual[0]!.timestamp - original[0]!.timestamp)
      for (const [index, packet] of actual.entries()) {
        const segmentOffset =
          index < original.length ? 0 : segmentOffsets.at(-1)!
        const expected =
          original[index % original.length]!.timestamp
          + trackOffsets.at(-1)!
          + segmentOffset
        assert.ok(Math.abs(packet.timestamp - expected) < 0.002)
      }
    }
    assert.ok(Math.abs(segmentOffsets[0]! - segmentOffsets[1]!) < 0.002)
    assert.ok(
      Math.abs(trackOffsets[0]! - trackOffsets[1]!) < 0.002,
      JSON.stringify({ format, trackOffsets }),
    )
    assert.ok(disk.size > 0)
  })
}

test('progressive video-only media remains valid without inventing an audio track', async context => {
  const core = await createCore(context)
  core.FS.mkdir('/inputs')
  core.FS.writeFile(
    '/inputs/0.media',
    await readFile(new URL('../fixtures/downloads/video.mp4', import.meta.url)),
  )
  const disk = new SparseDisk()
  runProgressiveFFmpeg(core, disk, 1, () => {})
  const input = new Input({
    formats: [MP4],
    source: new BlobSource(disk.blob()),
  })
  assert.ok(await input.getPrimaryVideoTrack())
  assert.equal(await input.getPrimaryAudioTrack(), null)
  input.dispose()
})

test('real WASM reports the original disk error instead of publishing a partial file', async context => {
  const core = await createCore(context)
  core.FS.mkdir('/inputs')
  core.FS.writeFile(
    '/inputs/0.media',
    await readFile(new URL('../fixtures/downloads/video.mp4', import.meta.url)),
  )
  const disk = new SparseDisk()
  disk.failure = new DOMException('disk full', 'QuotaExceededError')
  assert.throws(
    () => runProgressiveFFmpeg(core, disk, 1, () => {}),
    error => error === disk.failure,
  )
})

test('invalid progressive media fails instead of becoming a completed empty file', async context => {
  const core = await createCore(context)
  core.FS.mkdir('/inputs')
  core.FS.writeFile('/inputs/0.media', 'invalid media')
  assert.throws(
    () => runProgressiveFFmpeg(core, new SparseDisk(), 1, () => {}),
    /封装失败/,
  )
})
