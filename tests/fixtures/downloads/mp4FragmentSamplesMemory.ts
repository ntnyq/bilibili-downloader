import assert from 'node:assert/strict'
import process from 'node:process'
import {
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
} from 'mediabunny'
import { createDiskFragmentSamples } from '../../../utils/downloads/media/fragments/fragmentSamples'
import { temporaryFragmentIndex } from './fragmentIndex'
import { videoPackets } from './mp4FragmentMedia'
import { timestamp } from './mp4FragmentSamples'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StreamTargetChunk } from 'mediabunny'

const collectGarbage = globalThis.gc
assert.ok(collectGarbage)
const count = Number(process.argv[2])
const legacy = process.argv[3] === 'legacy'
const { config } = await videoPackets()
const directory = await mkdtemp(join(tmpdir(), 'bilibili-gop-memory-'))
const index = await temporaryFragmentIndex()
const media = await temporaryFragmentIndex('media')
let initial = process.memoryUsage()
let maxHeap = 0
let maxBuffers = 0
let maxRead = 0
let maxWrite = 0
let reads = 0
let writes = 0
let finishedAppending = false
let calls = 0
async function settle() {
  for (let at = 0; at < 3; at++) {
    await new Promise<void>(resolve => setImmediate(resolve))
    collectGarbage?.()
  }
}
async function measure() {
  await settle()
  const current = process.memoryUsage()
  maxHeap = Math.max(maxHeap, current.heapUsed - initial.heapUsed)
  maxBuffers = Math.max(maxBuffers, current.arrayBuffers - initial.arrayBuffers)
}
const store = createDiskFragmentSamples(async (trackId, kind) => {
  const file = await open(join(directory, `${trackId}-${kind}`), 'w+')
  return {
    async read(data, position) {
      maxRead = Math.max(maxRead, data.length)
      if (finishedAppending && ++reads % 128 === 0) await measure()
      return (await file.read(data, 0, data.length, position)).bytesRead
    },
    async write(data, position) {
      maxWrite = Math.max(maxWrite, data.length)
      if (finishedAppending && ++writes % 128 === 0) await measure()
      return (await file.write(data, 0, data.length, position)).bytesWritten
    },
    truncate: size => file.truncate(size),
    close: () => file.close(),
  }
})
let outputBytes = 0
const output = new Output({
  format: new Mp4OutputFormat({
    fastStart: 'fragmented',
    minimumFragmentDuration: 2,
    _fragmentIndexStore: index.store,
    _fragmentMediaStore: legacy ? media.store : undefined,
    _fragmentSampleStore: legacy
      ? undefined
      : {
          ...store,
          async get(track, id) {
            if (finishedAppending && ++calls % 65536 === 0) await measure()
            return store.get(track, id)
          },
          async sort(track, start, length) {
            await measure()
            await store.sort(track, start, length)
            await measure()
          },
          async readMedia(track, offset, length) {
            await measure()
            return store.readMedia(track, offset, length)
          },
        },
  }),
  target: new StreamTarget(
    new WritableStream<StreamTargetChunk>({
      write({ data }) {
        outputBytes += data.length
      },
    }),
    { chunked: true, chunkSize: 1024 * 1024 },
  ),
})
const source = new EncodedVideoPacketSource('avc')
output.addVideoTrack(source, { decoderConfig: config })
try {
  await output.start()
  // Fixed warm-up outside the measured GOP avoids counting initialization/JIT work.
  for (let at = 0; at < 32; at++)
    await source.add(new EncodedPacket(Uint8Array.of(0), 'key', at * 2, 2), {
      decoderConfig: config,
    })
  await settle()
  initial = process.memoryUsage()
  maxHeap = 0
  maxBuffers = 0
  for (let at = 0; at < count; at++) {
    const data = new Uint8Array(1 + (at % 3)).fill(at % 251)
    await source.add(
      new EncodedPacket(
        data,
        at === 0 ? 'key' : 'delta',
        timestamp(at, count, 100),
        at % 17 === 0 ? 0 : 1 / 24,
      ),
      { decoderConfig: config },
    )
    if (at % 16384 === 0) await measure()
  }
  await measure()
  const retained = process.memoryUsage()
  const retainedHeapBytes = retained.heapUsed - initial.heapUsed
  const retainedBufferBytes = retained.arrayBuffers - initial.arrayBuffers
  finishedAppending = true
  source.close()
  await output.finalize()
  await measure()
  console.log(
    JSON.stringify({
      count,
      legacy,
      retainedHeapBytes,
      retainedBufferBytes,
      maxHeap,
      maxBuffers,
      maxRead,
      maxWrite,
      outputBytes,
    }),
  )
  if (!legacy) {
    assert.ok(
      retainedHeapBytes < 4 * 1024 * 1024,
      `Retained heap ${retainedHeapBytes}`,
    )
    assert.ok(
      retainedBufferBytes < 2 * 1024 * 1024,
      `Retained buffers ${retainedBufferBytes}`,
    )
    assert.ok(maxHeap < 6 * 1024 * 1024, `Processing heap ${maxHeap}`)
    assert.ok(maxBuffers < 3 * 1024 * 1024, `Processing buffers ${maxBuffers}`)
    assert.ok(maxRead <= 65536)
    assert.ok(maxWrite <= 65536)
  }
} finally {
  await store.dispose()
  await media.dispose()
  await index.dispose()
  await rm(directory, { recursive: true, force: true })
}
