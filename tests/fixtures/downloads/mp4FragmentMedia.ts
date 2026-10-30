import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as mediabunny from 'mediabunny'
import type { FragmentMediaStore } from '../../../utils/downloads/media/fragments/fragmentMedia'

export async function videoPackets(library = mediabunny) {
  const input = new library.Input({
    formats: [library.MP4],
    source: new library.BlobSource(
      new Blob([await readFile(new URL('./long-gop.mp4', import.meta.url))]),
    ),
  })
  try {
    const track = await input.getPrimaryVideoTrack()
    assert.ok(track)
    const config = await track.getDecoderConfig()
    assert.ok(config)
    const packets = []
    for await (const packet of new library.EncodedPacketSink(track).packets())
      packets.push(packet)
    return { packets, config }
  } finally {
    input.dispose()
  }
}

export async function generateGops(
  media: FragmentMediaStore | undefined,
  library = mediabunny,
  repeats = 3,
) {
  const { packets, config } = await videoPackets(library)
  assert.equal(packets.filter(packet => packet.type === 'key').length, 1)
  assert.ok(
    packets.some(
      (packet, at) => at > 0 && packet.timestamp < packets[at - 1]!.timestamp,
    ),
  )
  const target = new library.BufferTarget()
  const output = new library.Output({
    format: new library.Mp4OutputFormat({
      fastStart: 'fragmented',
      minimumFragmentDuration: 2,
      _fragmentMediaStore: media,
    }),
    target,
  })
  const source = new library.EncodedVideoPacketSource('avc')
  output.addVideoTrack(source, { decoderConfig: config })
  await output.start()
  try {
    for (let repeat = 0; repeat < repeats; repeat++) {
      for (const packet of packets) {
        await source.add(
          new library.EncodedPacket(
            packet.data,
            packet.type,
            packet.timestamp + repeat * 4,
            packet.duration,
          ),
          { decoderConfig: config },
        )
      }
    }
    source.close()
    await output.finalize()
    assert.ok(target.buffer)
    return new Uint8Array(target.buffer)
  } catch (error) {
    await output.cancel().catch(() => {})
    throw error
  }
}
