import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { EncodedPacketSink, Input, MP4 } from 'mediabunny'
import { fragmentedMp4 } from './mp4Fragments'

const collectGarbage = globalThis.gc
assert.ok(collectGarbage)
const fragments = Number(process.argv[2])
const indexed = process.argv[3] === 'indexed'
assert.ok(fragments >= 1000)
const fixture = await fragmentedMp4({
  fragments,
  indexed,
  tfdt: false,
  recordReads: false,
})
if (process.argv[4] === 'buffer-pages') {
  const read: unknown = Reflect.get(fixture.source, '_read')
  assert.equal(typeof read, 'function')
  if (typeof read !== 'function') throw new TypeError('Missing source reader')
  Object.defineProperty(fixture.source, '_read', {
    async value(start: number, end: number, ...args: unknown[]) {
      const result: unknown = await Reflect.apply(read, fixture.source, [
        start,
        end,
        ...args,
      ])
      const table = fixture.indexes[0]!
      if (start < table.entries || end > table.end || end - start <= 16)
        return result
      assert.ok(result && typeof result === 'object')
      const bytes: unknown = Reflect.get(result, 'bytes')
      const offset: unknown = Reflect.get(result, 'offset')
      assert.ok(bytes instanceof Uint8Array)
      assert.equal(typeof offset, 'number')
      if (typeof offset !== 'number')
        throw new TypeError('Missing source offset')
      // Buffer.slice is a view. Small cached pages must not pin this 8 MiB backing.
      const backing = Buffer.alloc(8 * 1024 * 1024)
      backing.set(bytes.subarray(start - offset, end - offset))
      return {
        bytes: backing,
        view: new DataView(
          backing.buffer,
          backing.byteOffset,
          backing.byteLength,
        ),
        offset: start,
      }
    },
  })
}
async function settle() {
  for (let step = 0; step < 3; step++) {
    await new Promise<void>(resolve => setImmediate(resolve))
    collectGarbage?.()
  }
}
await settle()
const initial = process.memoryUsage()
const input = new Input({ formats: [MP4], source: fixture.source })
try {
  const track = await input.getPrimaryAudioTrack()
  assert.ok(track)
  const sink = new EncodedPacketSink(track)
  let packet = await sink.getFirstPacket()
  for (let sample = 0; sample < fragments * 3; sample++) {
    assert.ok(packet)
    assert.equal(packet.timestamp, fixture.timestamp(sample))
    if (sample % 2048 === 0)
      assert.deepEqual(packet.data, fixture.packet(1, sample))
    packet = await sink.getNextPacket(packet)
  }
  assert.equal(packet, null)
  // Exercise rereads after eviction, including reconstruction of an old prefix.
  for (const index of [3, fragments * 3 - 1, 300]) {
    const found = await sink.getPacket(fixture.timestamp(index))
    assert.deepEqual(found?.data, fixture.packet(1, index))
  }
  await settle()
  const after = process.memoryUsage()
  const retainedHeapBytes = after.heapUsed - initial.heapUsed
  const retainedBufferBytes = after.arrayBuffers - initial.arrayBuffers
  console.log(
    JSON.stringify({
      fragments,
      indexed,
      retainedHeapBytes,
      retainedBufferBytes,
    }),
  )
  assert.ok(
    retainedHeapBytes < 4 * 1024 * 1024,
    `Retained heap: ${retainedHeapBytes}`,
  )
  assert.ok(
    retainedBufferBytes < 1024 * 1024,
    `Retained buffers: ${retainedBufferBytes}`,
  )
} finally {
  input.dispose()
}
