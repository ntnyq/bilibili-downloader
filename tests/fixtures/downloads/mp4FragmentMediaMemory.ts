import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import process from 'node:process'
import {
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
} from 'mediabunny'
import { temporaryFragmentIndex } from './fragmentIndex'
import { videoPackets } from './mp4FragmentMedia'
import type { StreamTargetChunk } from 'mediabunny'

const collectGarbage = globalThis.gc
assert.ok(collectGarbage)
const samples = Number(process.argv[2])
const legacy = process.argv[3] === 'legacy'
const wideBacking = process.argv[3] === 'wide-backing'
const { config } = await videoPackets()
const media = await temporaryFragmentIndex('media')
let maxReadBytes = 0
let maxWriteBytes = 0
let writtenBytes = 0
let sampledBuffers = 0
let reads = 0
async function settle() {
  for (let step = 0; step < 3; step++) {
    await new Promise<void>(resolve => setImmediate(resolve))
    collectGarbage?.()
  }
}
let initial = process.memoryUsage()
const output = new Output({
  format: new Mp4OutputFormat({
    fastStart: 'fragmented',
    minimumFragmentDuration: 2,
    _fragmentMediaStore: legacy
      ? undefined
      : {
          append: media.store.append,
          reset: media.store.reset,
          async read(trackId, offset, length) {
            maxReadBytes = Math.max(maxReadBytes, length)
            const page = await media.store.read(trackId, offset, length)
            if (++reads % 128 === 0 || length < 65536) {
              await settle()
              sampledBuffers = Math.max(
                sampledBuffers,
                process.memoryUsage().arrayBuffers - initial.arrayBuffers,
              )
            }
            return page
          },
        },
  }),
  target: new StreamTarget(
    new WritableStream<StreamTargetChunk>({
      write({ data }) {
        maxWriteBytes = Math.max(maxWriteBytes, data.length)
        writtenBytes += data.length
      },
    }),
    { chunked: true, chunkSize: 1024 * 1024 },
  ),
})
const source = new EncodedVideoPacketSource('avc')
output.addVideoTrack(source, { decoderConfig: config })
await output.start()
// Warm muxing and disk/page I/O before measuring one unbroken GOP.
for (let at = 0; at < 32; at++) {
  await source.add(new EncodedPacket(Uint8Array.of(0), 'key', at * 2, 2), {
    decoderConfig: config,
  })
}
await settle()
initial = process.memoryUsage()
const payloadBytes = 32771
try {
  for (let at = 0; at < samples; at++) {
    // Fresh buffers expose retained media; reusing one array hides the leak.
    // Wide backing views additionally catch a small sample pinning a large input.
    const backing = new Uint8Array(wideBacking ? 8 * 1024 * 1024 : payloadBytes)
    const data = backing.subarray(0, payloadBytes)
    data.fill(at % 251)
    await source.add(
      new EncodedPacket(
        data,
        at === 0 ? 'key' : 'delta',
        100 + at / 24,
        1 / 24,
      ),
      { decoderConfig: config },
    )
    if (at % 512 === 0) {
      await settle()
      sampledBuffers = Math.max(
        sampledBuffers,
        process.memoryUsage().arrayBuffers - initial.arrayBuffers,
      )
    }
  }
  await settle()
  const retained = process.memoryUsage()
  const retainedHeapBytes = retained.heapUsed - initial.heapUsed
  const retainedBufferBytes = retained.arrayBuffers - initial.arrayBuffers
  const spooledBytes = legacy
    ? 0
    : (await stat(`${media.directory}/media-1.tmp`)).size
  source.close()
  await output.finalize()
  console.log(
    JSON.stringify({
      samples,
      legacy,
      wideBacking,
      payloadBytes,
      retainedHeapBytes,
      retainedBufferBytes,
      sampledBuffers,
      spooledBytes,
      writtenBytes,
      maxReadBytes,
      maxWriteBytes,
      reads,
    }),
  )
  assert.ok(writtenBytes >= samples * payloadBytes)
  assert.ok(maxWriteBytes <= 1024 * 1024)
  if (!legacy) {
    assert.ok(
      spooledBytes
        >= Math.floor(((samples - 2) * payloadBytes) / 65536) * 65536,
    )
    assert.ok(maxReadBytes <= 65536)
    // One caller-held/queued packet can still pin its backing buffer. The store
    // itself must copy its page and release every older packet's backing store.
    const ceiling = wideBacking ? 32 * 1024 * 1024 : 4 * 1024 * 1024
    assert.ok(
      retainedBufferBytes < ceiling,
      `Retained buffers: ${retainedBufferBytes}`,
    )
    assert.ok(sampledBuffers < ceiling, `Sampled buffers: ${sampledBuffers}`)
    // Sample/timestamp metadata still scales with GOP sample count. This ceiling
    // only guards accidental duplicate records, not constant metadata memory.
    assert.ok(retainedHeapBytes < samples * 512 + 4 * 1024 * 1024)
  }
} finally {
  await media.dispose()
}
