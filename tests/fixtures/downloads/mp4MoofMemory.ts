import assert from 'node:assert/strict'
import process from 'node:process'
import { EncodedPacketSink, Input, MP4 } from 'mediabunny'
import { largeMoof } from './mp4Moof'

async function settle() {
  for (let step = 0; step < 3; step++) {
    await new Promise<void>(resolve => setImmediate(resolve))
    globalThis.gc?.()
  }
}
const count = Number(process.argv[2]),
  mode = process.argv[3]
assert.ok(globalThis.gc)
const fixture = await largeMoof({
  samples: count,
  runSize: mode === 'many-runs' ? 1 : count,
  recordReads: false,
  bufferPages: mode === 'buffer-pages',
})
const input = new Input({ formats: [MP4], source: fixture.source })
const track = await input.getPrimaryAudioTrack()
assert.ok(track)
const sink = new EncodedPacketSink(track)
await settle()
const baseline = process.memoryUsage()
const held = await sink.getFirstPacket()
assert.ok(held)
for (const index of [
  count - 1,
  4097,
  Math.floor(count / 2),
  19,
  count - 7,
  2,
]) {
  const packet = await sink.getPacket(fixture.pts(index) / 48000)
  assert.deepEqual(packet?.data, fixture.packet(index))
}
assert.deepEqual((await sink.getNextPacket(held))?.data, fixture.packet(1))
await settle()
const measured = process.memoryUsage()
console.log(
  JSON.stringify({
    count,
    mode,
    heap: measured.heapUsed - baseline.heapUsed,
    buffers: measured.arrayBuffers - baseline.arrayBuffers,
  }),
)
input.dispose()
