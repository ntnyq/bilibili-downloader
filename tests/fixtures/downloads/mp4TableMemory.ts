import assert from 'node:assert/strict'
import process from 'node:process'
import { EncodedPacketSink, Input, MP4 } from 'mediabunny'
import { indexedMp4 } from './mp4Index'

// Keep the fixture allocated before the baseline and disable read recording so
// the measurements include retained parser state, not input data or test logs.
const collectGarbage = globalThis.gc
assert.ok(collectGarbage)
const samples = Number(process.argv[2])
assert.ok(samples >= 20000)
const fixture = await indexedMp4({ samples, recordReads: false })
collectGarbage()
await new Promise<void>(resolve => setImmediate(resolve))
collectGarbage()
await new Promise<void>(resolve => setImmediate(resolve))
collectGarbage()
const initial = process.memoryUsage()
const input = new Input({ formats: [MP4], source: fixture.source })
try {
  const track = await input.getPrimaryAudioTrack()
  assert.ok(track)
  const sink = new EncodedPacketSink(track)
  for (let step = 0; step < 256; step++) {
    const index = Math.floor(step * (samples - 1) / 255)
    const packet = await sink.getPacket(fixture.timestamp(index))
    assert.ok(packet)
    assert.deepEqual(packet.data, fixture.packet(index))
  }
  let packet = await sink.getFirstPacket()
  for (let index = 0; index < 2048; index++) {
    assert.ok(packet)
    packet = await sink.getNextPacket(packet)
  }
  await new Promise<void>(resolve => setImmediate(resolve))
  collectGarbage()
  await new Promise<void>(resolve => setImmediate(resolve))
  collectGarbage()
  const after = process.memoryUsage()
  const retainedHeapBytes = after.heapUsed - initial.heapUsed
  const retainedBufferBytes = after.arrayBuffers - initial.arrayBuffers
  console.log(JSON.stringify({ samples, retainedHeapBytes, retainedBufferBytes }))
  assert.ok(retainedHeapBytes < 4 * 1024 * 1024, `Retained heap: ${retainedHeapBytes}`)
  assert.ok(retainedBufferBytes < 1024 * 1024, `Retained buffers: ${retainedBufferBytes}`)
} finally {
  input.dispose()
}
