import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import {
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  Input,
  MP4,
} from 'mediabunny'
import { createRemuxOutput } from '../../../utils/downloads/remuxMedia'
import { temporaryFragmentSamples } from './fragmentSamples'
import { temporaryFragmentIndex } from './fragmentIndex'
import type { StreamTargetChunk } from 'mediabunny'

// Run in a separate process with --expose-gc so other tests and their media
// buffers cannot obscure a regression in retained output sample metadata.
const collectGarbage = globalThis.gc
assert.ok(collectGarbage)
const input = new Input({
  formats: [MP4],
  source: new BlobSource(
    new Blob([await readFile(new URL('./audio.m4a', import.meta.url))]),
  ),
})
const track = await input.getPrimaryAudioTrack()
assert.ok(track)
const config = await track.getDecoderConfig()
const packet = await new EncodedPacketSink(track).getFirstPacket()
assert.ok(config)
assert.ok(packet)
input.dispose()
const index = await temporaryFragmentIndex()
const media = await temporaryFragmentSamples()
try {
  let writtenBytes = 0
  let maxWriteBytes = 0
  const output = createRemuxOutput(
    new WritableStream<StreamTargetChunk>({
      write({ data }) {
        writtenBytes += data.byteLength
        maxWriteBytes = Math.max(maxWriteBytes, data.byteLength)
      },
    }),
    index.store,
    media.store,
  )
  const source = new EncodedAudioPacketSource('aac')
  output.addAudioTrack(source, { decoderConfig: config })
  await output.start()
  collectGarbage()
  const initialHeap = process.memoryUsage().heapUsed
  const samples = 500000
  for (let index = 0; index < samples; index++) {
    await source.add(
      new EncodedPacket(
        packet.data,
        'key',
        index * packet.duration,
        packet.duration,
      ),
      { decoderConfig: config },
    )
  }
  collectGarbage()
  const retainedHeapBytes = process.memoryUsage().heapUsed - initialHeap
  source.close()
  await output.finalize()
  console.log(
    JSON.stringify({ samples, retainedHeapBytes, writtenBytes, maxWriteBytes }),
  )
  assert.ok(writtenBytes > 50 * 1024 * 1024)
  assert.ok(maxWriteBytes <= 1024 * 1024)
  // The previous ordinary MP4 retains about 76 MiB for this fixture. Allow ample
  // runtime variance while detecting a return to one retained record per sample.
  assert.ok(retainedHeapBytes < 16 * 1024 * 1024)
} finally {
  await media.dispose()
  await index.dispose()
}
