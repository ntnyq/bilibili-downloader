import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BlobSource, EncodedPacketSink, Input, MP4 } from 'mediabunny'

export async function audioPacket() {
  const input = new Input({
    formats: [MP4],
    source: new BlobSource(
      new Blob([await readFile(new URL('./audio.m4a', import.meta.url))]),
    ),
  })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const config = await track.getDecoderConfig()
    const packet = await new EncodedPacketSink(track).getFirstPacket()
    assert.ok(config)
    assert.ok(packet)
    return { config, packet }
  } finally {
    input.dispose()
  }
}

/**
 * Reads only the final MFRA box, using its MFRO footer.
 */
export function fragmentIndex(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const size = view.getUint32(bytes.length - 4)
  const index = bytes.subarray(bytes.length - size)
  assert.equal(new TextDecoder().decode(index.subarray(4, 8)), 'mfra')
  assert.equal(new DataView(index.buffer, index.byteOffset).getUint32(0), size)
  return index
}
