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
import type { FragmentIndexStore } from './fragmentIndex'
import type { FragmentSampleStore } from './fragmentSamples'

export type RemuxKind = 'dash' | 'audio' | 'progressive'

interface PacketTrack {
  sink: EncodedPacketSink
  packet: EncodedPacket | null
  add: (packet: EncodedPacket) => Promise<void>
  close: () => void
}

/**
 * Keep fragment payloads and completed-fragment indexes on disk.
 */
export function createRemuxOutput(
  writable: WritableStream<StreamTargetChunk>,
  fragmentIndex: FragmentIndexStore,
  fragmentSamples: FragmentSampleStore,
) {
  return new Output({
    // The pinned patch spools TFRA records and streams the final MFRA in pages.
    format: new Mp4OutputFormat({
      fastStart: 'fragmented',
      minimumFragmentDuration: 2,
      _fragmentIndexStore: fragmentIndex,
      _fragmentSampleStore: fragmentSamples,
    }),
    target: new StreamTarget(writable, {
      chunked: true,
      chunkSize: 1024 * 1024,
    }),
  })
}

/**
 * Copies encoded packets in decode order, interleaving tracks to bound buffering.
 * The target and disk spools receive bounded writes; GOP payloads stay on disk.
 */
export async function remuxMedia(
  kind: Exclude<RemuxKind, 'progressive'>,
  blobs: Blob[],
  writable: WritableStream<StreamTargetChunk>,
  signal: AbortSignal,
  fragmentIndex: FragmentIndexStore,
  fragmentSamples: FragmentSampleStore,
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
  const guardStore = (store: FragmentIndexStore): FragmentIndexStore => ({
    async append(trackId, data) {
      signal.throwIfAborted()
      await store.append(trackId, data)
      signal.throwIfAborted()
    },
    async read(trackId, offset, length) {
      signal.throwIfAborted()
      const data = await store.read(trackId, offset, length)
      signal.throwIfAborted()
      return data
    },
  })
  const check = async <Result>(
    operation: () => Result | PromiseLike<Result>,
  ) => {
    signal.throwIfAborted()
    const value = await operation()
    signal.throwIfAborted()
    return value
  }
  const output = createRemuxOutput(writable, guardStore(fragmentIndex), {
    append(trackId, sample, data) {
      return check(() => fragmentSamples.append(trackId, sample, data))
    },
    get: (trackId, id) => check(() => fragmentSamples.get(trackId, id)),
    set(trackId, id, sample) {
      return check(() => fragmentSamples.set(trackId, id, sample))
    },
    sort(trackId, start, count) {
      return check(() => fragmentSamples.sort(trackId, start, count))
    },
    sorted(trackId, index) {
      return check(() => fragmentSamples.sorted(trackId, index))
    },
    readMedia(trackId, offset, length) {
      return check(() => fragmentSamples.readMedia(trackId, offset, length))
    },
    release(trackId, before) {
      return check(() => fragmentSamples.release(trackId, before))
    },
  })
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
