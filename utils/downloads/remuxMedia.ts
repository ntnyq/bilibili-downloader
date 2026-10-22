import {
  BlobSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  StreamTarget,
} from 'mediabunny'
import type { EncodedPacket, StreamTargetChunk } from 'mediabunny'

export type RemuxKind = 'dash' | 'audio' | 'progressive'

interface PacketTrack {
  sink: EncodedPacketSink
  packet: EncodedPacket | null
  add: (packet: EncodedPacket) => Promise<void>
  close: () => void
}

/**
 * Bound output sample metadata to the active fragment and a compact seek index.
 */
export function createRemuxOutput(writable: WritableStream<StreamTargetChunk>) {
  return new Output({
    // The pinned patch releases sample records after each fragment is written.
    format: new Mp4OutputFormat({
      fastStart: 'fragmented',
      minimumFragmentDuration: 2,
    }),
    target: new StreamTarget(writable, {
      chunked: true,
      chunkSize: 1024 * 1024,
    }),
  })
}

/**
 * Copies encoded packets in decode order, interleaving tracks to bound buffering.
 * The seekable target receives small writes; media bytes never accumulate in RAM.
 */
export async function remuxMedia(
  kind: Exclude<RemuxKind, 'progressive'>,
  blobs: Blob[],
  writable: WritableStream<StreamTargetChunk>,
  signal: AbortSignal,
  onProgress: (bytes: number) => void = () => {},
) {
  signal.throwIfAborted()
  if (blobs.length !== (kind === 'dash' ? 2 : 1)) {
    throw new Error('音视频素材数量无效。')
  }
  const inputs = blobs.map(
    blob =>
      new Input({
        formats: [MP4],
        source: new BlobSource(blob, {
          maxCacheSize: 4 * 1024 * 1024,
          useStreamReader: false,
        }),
      }),
  )
  const output = createRemuxOutput(writable)
  const disposeInputs = () => inputs.forEach(input => input.dispose())
  signal.addEventListener('abort', disposeInputs, { once: true })
  try {
    const tracks: PacketTrack[] = []
    if (kind === 'dash') {
      const track = await inputs[0]!.getPrimaryVideoTrack()
      const codec = await track?.getCodec()
      const config = await track?.getDecoderConfig()
      if (!track || !codec || !config) {
        throw new Error('无法读取 MP4 视频轨道。')
      }
      const source = new EncodedVideoPacketSource(codec)
      output.addVideoTrack(source, {
        transformationMatrix: await track.getTransformationMatrix(),
        decoderConfig: config,
      })
      tracks.push({
        sink: new EncodedPacketSink(track),
        packet: null,
        add: packet => source.add(packet, { decoderConfig: config }),
        close: () => source.close(),
      })
    }
    const track = await inputs.at(-1)!.getPrimaryAudioTrack()
    const config = await track?.getDecoderConfig()
    if (!track || (await track.getCodec()) !== 'aac' || !config) {
      throw new Error('无法读取 MP4 中的 AAC 音轨。')
    }
    const source = new EncodedAudioPacketSource('aac')
    output.addAudioTrack(source, { decoderConfig: config })
    tracks.push({
      sink: new EncodedPacketSink(track),
      packet: null,
      add: packet => source.add(packet, { decoderConfig: config }),
      close: () => source.close(),
    })
    for (const entry of tracks) {
      entry.packet = await entry.sink.getFirstPacket()
      if (!entry.packet) {
        throw new Error('素材轨道没有可封装的数据包。')
      }
    }
    signal.throwIfAborted()
    await output.start()
    let bytes = 0
    while (true) {
      signal.throwIfAborted()
      // Only compare each track's next packet; never sort within a video track,
      // where B-frame presentation timestamps can differ from decode order.
      const entry = tracks
        .filter(entry => entry.packet)
        .toSorted((a, b) => a.packet!.timestamp - b.packet!.timestamp)[0]
      const packet = entry?.packet
      if (!entry || !packet) {
        break
      }
      await entry.add(packet)
      bytes += packet.byteLength
      onProgress(bytes)
      entry.packet = await entry.sink.getNextPacket(packet)
      if (!entry.packet) {
        entry.close()
      }
    }
    signal.throwIfAborted()
    await output.finalize()
  } catch (error) {
    await output.cancel().catch(() => {})
    signal.throwIfAborted()
    throw error
  } finally {
    signal.removeEventListener('abort', disposeInputs)
    disposeInputs()
  }
}
