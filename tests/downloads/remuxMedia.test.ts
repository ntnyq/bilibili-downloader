import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  BlobSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MP4,
} from 'mediabunny'
import { createRemuxOutput, remuxMedia } from '../../utils/downloads/remuxMedia'
import type { StreamTargetChunk } from 'mediabunny'

async function fixture(name: string) {
  return new Blob([
    await readFile(new URL(`../fixtures/downloads/${name}`, import.meta.url)),
  ])
}

function memoryTarget() {
  let bytes = new Uint8Array(0)
  let closed = false
  const writes: number[] = []
  return {
    writable: new WritableStream<StreamTargetChunk>({
      write({ data, position }) {
        writes.push(data.byteLength)
        if (position + data.byteLength > bytes.byteLength) {
          const next = new Uint8Array(position + data.byteLength)
          next.set(bytes)
          bytes = next
        }
        bytes.set(data, position)
      },
      close() {
        closed = true
      },
    }),
    blob: () => new Blob([bytes]),
    isClosed: () => closed,
    writes,
  }
}

async function packets(blob: Blob, kind: 'video' | 'audio') {
  const input = new Input({ formats: [MP4], source: new BlobSource(blob) })
  try {
    const track =
      kind === 'video'
        ? await input.getPrimaryVideoTrack()
        : await input.getPrimaryAudioTrack()
    assert.ok(track)
    const result = []
    for await (const packet of new EncodedPacketSink(track).packets()) {
      result.push({
        data: packet.data,
        type: packet.type,
        timestamp: Math.round(packet.timestamp * 1e6),
        duration: Math.round(packet.duration * 1e6),
      })
    }
    return result
  } finally {
    input.dispose()
  }
}

test('remuxes DASH without reencoding or reordering B frames and preserves track timing', async () => {
  const video = await fixture('video.mp4')
  const audio = await fixture('audio.m4a')
  const target = memoryTarget()
  const progress: number[] = []
  await remuxMedia(
    'dash',
    [video, audio],
    target.writable,
    new AbortController().signal,
    bytes => progress.push(bytes),
  )
  const before = await packets(video, 'video')
  assert.ok(
    before.some(
      (packet, index) =>
        index > 0 && packet.timestamp < before[index - 1]!.timestamp,
    ),
  )
  assert.deepEqual(await packets(target.blob(), 'video'), before)
  assert.deepEqual(
    await packets(target.blob(), 'audio'),
    await packets(audio, 'audio'),
  )
  assert.ok(target.isClosed())
  assert.ok(progress.at(-1)! > 0)
  assert.ok(
    progress.every((value, index) => !index || value > progress[index - 1]!),
  )
  assert.ok(target.writes.every(bytes => bytes <= 1024 * 1024))
})

test('exports AAC alone into a seekable M4A with no video track', async () => {
  const audio = await fixture('audio.m4a')
  const target = memoryTarget()
  await remuxMedia(
    'audio',
    [audio],
    target.writable,
    new AbortController().signal,
  )
  assert.deepEqual(
    await packets(target.blob(), 'audio'),
    await packets(audio, 'audio'),
  )
  const input = new Input({
    formats: [MP4],
    source: new BlobSource(target.blob()),
  })
  assert.equal(await input.getPrimaryVideoTrack(), null)
  input.dispose()
})

test('preserves keyframes and random access across fragments after the audio track ends', async () => {
  const input = new Input({
    formats: [MP4],
    source: new BlobSource(await fixture('video.mp4')),
  })
  const track = await input.getPrimaryVideoTrack()
  assert.ok(track)
  const config = await track.getDecoderConfig()
  assert.ok(config)
  const original: EncodedPacket[] = []
  for await (const packet of new EncodedPacketSink(track).packets()) {
    original.push(packet)
  }
  input.dispose()
  const generated = memoryTarget()
  const output = createRemuxOutput(generated.writable)
  const source = new EncodedVideoPacketSource('avc')
  output.addVideoTrack(source, { decoderConfig: config })
  await output.start()
  for (let repeat = 0; repeat < 6; repeat++) {
    for (const packet of original) {
      await source.add(
        new EncodedPacket(
          packet.data,
          packet.type,
          packet.timestamp + repeat * 2,
          packet.duration,
        ),
        { decoderConfig: config },
      )
    }
  }
  source.close()
  await output.finalize()
  const target = memoryTarget()
  await remuxMedia(
    'dash',
    [generated.blob(), await fixture('audio.m4a')],
    target.writable,
    new AbortController().signal,
  )
  assert.deepEqual(
    await packets(target.blob(), 'video'),
    await packets(generated.blob(), 'video'),
  )
  assert.deepEqual(
    await packets(target.blob(), 'audio'),
    await packets(await fixture('audio.m4a'), 'audio'),
  )
  const result = new Input({
    formats: [MP4],
    source: new BlobSource(target.blob()),
  })
  try {
    const video = await result.getPrimaryVideoTrack()
    assert.ok(video)
    const sink = new EncodedPacketSink(video)
    for (const second of [10, 1, 7, 3, 11, 0, 5]) {
      const packet = await sink.getKeyPacket(second + 0.2)
      assert.ok(packet)
      assert.equal(packet.type, 'key')
      assert.equal(packet.timestamp, second)
      const reference = original.find(
        packet => packet.type === 'key' && packet.timestamp === second % 2,
      )
      assert.ok(reference)
      assert.deepEqual(packet.data, reference.data)
    }
  } finally {
    result.dispose()
  }
})

test('does not publish an empty or missing track as a successful output', async () => {
  const audio = await fixture('audio.m4a')
  await assert.rejects(
    remuxMedia(
      'dash',
      [audio],
      memoryTarget().writable,
      new AbortController().signal,
    ),
    /素材数量/,
  )
  await assert.rejects(
    remuxMedia(
      'dash',
      [audio, audio],
      memoryTarget().writable,
      new AbortController().signal,
    ),
    /视频轨道/,
  )
})

test('propagates disk failures and honors cancellation while copying packets', async () => {
  const audio = await fixture('audio.m4a')
  const diskError = new DOMException('disk full', 'QuotaExceededError')
  await assert.rejects(
    remuxMedia(
      'audio',
      [audio],
      new WritableStream({
        write() {
          throw diskError
        },
      }),
      new AbortController().signal,
    ),
    error => error === diskError,
  )
  const controller = new AbortController()
  await assert.rejects(
    remuxMedia(
      'audio',
      [audio],
      memoryTarget().writable,
      controller.signal,
      () => controller.abort(),
    ),
    { name: 'AbortError' },
  )
})

test('retains a small seek index instead of every sample during long audio exports', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--expose-gc',
      '--import',
      'tsx',
      fileURLToPath(
        new URL('../fixtures/downloads/remuxMemory.ts', import.meta.url),
      ),
    ],
    { timeout: 60000 },
  )
  assert.match(stdout, /"samples":500000/u)
})
