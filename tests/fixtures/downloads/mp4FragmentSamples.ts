import assert from 'node:assert/strict'
import * as mediabunny from 'mediabunny'
import { videoPackets } from './mp4FragmentMedia'
import type { FragmentSampleStore } from '../../../utils/downloads/fragmentSamples'
import type { FragmentIndexStore } from '../../../utils/downloads/fragmentIndex'

export function timestamp(at: number, count: number, base = -0.125) {
  return base + (at === 0 ? 0 : Math.floor((count - at) / 3) / 24)
}

export async function generateStoredSamples(
  store: FragmentSampleStore | undefined,
  index: FragmentIndexStore,
  library = mediabunny,
  count = 96,
  real = true,
) {
  const { packets, config } = await videoPackets(library)
  const target = new library.BufferTarget()
  const output = new library.Output({
    format: new library.Mp4OutputFormat({
      fastStart: 'fragmented',
      minimumFragmentDuration: 2,
      _fragmentIndexStore: index,
      _fragmentSampleStore: store,
    }),
    target,
  })
  const source = new library.EncodedVideoPacketSource('avc')
  output.addVideoTrack(source, { decoderConfig: config })
  await output.start()
  try {
    for (let repeat = 0; repeat < 3; repeat++) {
      for (let at = 0; at < count; at++) {
        const original = packets[at % packets.length]!
        const data = real
          ? original.data
          : new Uint8Array(1 + (at % 3)).fill(at % 251)
        const time = real
          ? original.timestamp + repeat * 4
          : timestamp(at, count, (repeat * count) / 24 - 0.125)
        const duration = real ? original.duration : at % 17 === 0 ? 0 : 1 / 24
        await source.add(
          new library.EncodedPacket(
            data,
            real ? original.type : at === 0 ? 'key' : 'delta',
            time,
            duration,
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
