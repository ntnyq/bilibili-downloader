import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import process from 'node:process'
import {
  EncodedAudioPacketSource,
  EncodedPacket,
  Mp4OutputFormat,
  Output,
  StreamTarget,
} from 'mediabunny'
import { temporaryFragmentIndex } from './fragmentIndex'
import { audioPacket } from './mp4OutputIndex'
import type { StreamTargetChunk } from 'mediabunny'

const collectGarbage = globalThis.gc
assert.ok(collectGarbage)
const fragments = Number(process.argv[2])
const legacy = process.argv[3] === 'legacy'
const { config, packet } = await audioPacket()
const index = await temporaryFragmentIndex()
async function settle() {
  for (let step = 0; step < 3; step++) {
    await new Promise<void>(resolve => setImmediate(resolve))
    collectGarbage?.()
  }
}
let maxReadBytes = 0
let reads = 0
let maxWriteBytes = 0
let writtenBytes = 0
let finalHeapBytes = 0
let finalBufferBytes = 0
let footerSize = 0
await settle()
const initial = process.memoryUsage()
try {
  const output = new Output({
    format: new Mp4OutputFormat({
      fastStart: 'fragmented',
      minimumFragmentDuration: 2,
      _fragmentIndexStore: legacy
        ? undefined
        : {
            append: index.store.append,
            async read(trackId, offset, length) {
              maxReadBytes = Math.max(maxReadBytes, length)
              const page = await index.store.read(trackId, offset, length)
              if (++reads % 8 === 0 || length < 65536) {
                await settle()
                const memory = process.memoryUsage()
                finalHeapBytes = Math.max(
                  finalHeapBytes,
                  memory.heapUsed - initial.heapUsed,
                )
                finalBufferBytes = Math.max(
                  finalBufferBytes,
                  memory.arrayBuffers - initial.arrayBuffers,
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
          if (data.length >= 16) {
            const end = data.subarray(-16)
            if (new TextDecoder().decode(end.subarray(4, 8)) === 'mfro') {
              footerSize = new DataView(end.buffer, end.byteOffset).getUint32(
                12,
              )
            }
          }
        },
      }),
      { chunked: true, chunkSize: 1024 * 1024 },
    ),
  })
  const source = new EncodedAudioPacketSource('aac')
  output.addAudioTrack(source, { decoderConfig: config })
  await output.start()
  for (let at = 0; at < fragments; at++) {
    await source.add(new EncodedPacket(packet.data, 'key', at * 2, 2), {
      decoderConfig: config,
    })
  }
  await settle()
  const beforeFinalize = process.memoryUsage()
  const retainedHeapBytes = beforeFinalize.heapUsed - initial.heapUsed
  const retainedBufferBytes = beforeFinalize.arrayBuffers - initial.arrayBuffers
  const spooledBeforeFinalize = legacy
    ? 0
    : (await stat(`${index.directory}/index-1.tmp`)).size
  source.close()
  await output.finalize()
  const diskBytes = legacy
    ? 0
    : (await stat(`${index.directory}/index-1.tmp`)).size
  console.log(
    JSON.stringify({
      fragments,
      legacy,
      retainedHeapBytes,
      retainedBufferBytes,
      finalHeapBytes,
      finalBufferBytes,
      maxReadBytes,
      reads,
      maxWriteBytes,
      writtenBytes,
      spooledBeforeFinalize,
      diskBytes,
      footerSize,
    }),
  )
  assert.equal(footerSize, 48 + 28 * fragments)
  assert.ok(maxWriteBytes <= 1024 * 1024)
  if (!legacy) {
    assert.equal(diskBytes, 28 * fragments)
    assert.ok(
      spooledBeforeFinalize
        >= Math.floor((28 * (fragments - 2)) / 65536) * 65536,
    )
    assert.ok(maxReadBytes <= 65536)
    assert.equal(reads, Math.ceil((28 * fragments) / 65536))
    assert.ok(
      retainedHeapBytes < 4 * 1024 * 1024,
      `Retained heap: ${retainedHeapBytes}`,
    )
    assert.ok(
      retainedBufferBytes < 2 * 1024 * 1024,
      `Retained buffers: ${retainedBufferBytes}`,
    )
    assert.ok(
      finalHeapBytes < 4 * 1024 * 1024,
      `Finalizing heap: ${finalHeapBytes}`,
    )
    assert.ok(
      finalBufferBytes < 2 * 1024 * 1024,
      `Finalizing buffers: ${finalBufferBytes}`,
    )
  }
} finally {
  await index.dispose()
}
