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
import type { FragmentIndexStore } from './fragments/fragmentIndex'
import type { FragmentSampleStore } from './fragments/fragmentSamples'

export type RemuxKind = 'dash' | 'audio' | 'progressive'

interface PacketTrack {
  sink: EncodedPacketSink
  packet: EncodedPacket | null
  add: (packet: EncodedPacket) => Promise<void>
  close: () => void
}

/**
 * Keep fragment payloads and completed-fragment indexes on disk.
 *
 * @param writable - Positioned StreamTargetChunk destination with
 * caller-managed backpressure.
 * @param fragmentIndex - Temporary per-track TFRA index store used during
 * finalization.
 * @param fragmentSamples - Disk-backed sample descriptor/media store used to
 * bound fragment buffering.
 * @returns A Mediabunny fragmented-MP4 output configured for two-second
 * minimum fragments and 1 MiB target chunks.
 * @throws The Mediabunny configuration error if the target or output options
 *   are rejected.
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
 * Copies encoded packets in decode order, interleaving tracks to bound
 * buffering. The target and disk spools receive bounded writes; GOP payloads
 * stay on disk.
 *
 * @param kind - dash for separate video/audio inputs, or audio for one AAC
 * input.
 * @param blobs - Complete input Blobs ordered as video then audio for DASH, or
 * audio alone.
 * @param writable - Positioned output stream receiving bounded MP4/M4A chunks.
 * @param signal - Cancellation signal checked around disk and packet
 * operations; callers terminate the Worker for synchronous parsing.
 * @param fragmentIndex - Caller-owned completed-fragment index spool; not
 * disposed by this function.
 * @param fragmentSamples - Caller-owned sample/media spool; not disposed by
 * this function.
 * @param onProgress - Optional callback receiving cumulative encoded packet
 * bytes; defaults to a no-op.
 * @returns A promise resolving without a value after the output is finalized;
 * input readers are always disposed.
 * @throws {Error} If the input count, video/AAC tracks, codec configuration,
 *   or encoded packet data is unusable.
 * @throws The abort reason, Mediabunny error, output-stream error, or
 *   spool/progress failure if remuxing is interrupted.
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
  const createAbortableFragmentStore = (
    store: FragmentIndexStore,
  ): FragmentIndexStore => ({
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
  const withAbortCheck = async <Result>(
    operation: () => Result | PromiseLike<Result>,
  ) => {
    signal.throwIfAborted()
    const value = await operation()
    signal.throwIfAborted()
    return value
  }
  const output = createRemuxOutput(
    writable,
    createAbortableFragmentStore(fragmentIndex),
    {
      append(trackId, sample, data) {
        return withAbortCheck(() =>
          fragmentSamples.append(trackId, sample, data),
        )
      },
      get(trackId, id) {
        return withAbortCheck(() => fragmentSamples.get(trackId, id))
      },
      set(trackId, id, sample) {
        return withAbortCheck(() => fragmentSamples.set(trackId, id, sample))
      },
      sort(trackId, start, count) {
        return withAbortCheck(() => fragmentSamples.sort(trackId, start, count))
      },
      sorted(trackId, index) {
        return withAbortCheck(() => fragmentSamples.sorted(trackId, index))
      },
      readMedia(trackId, offset, length) {
        return withAbortCheck(() =>
          fragmentSamples.readMedia(trackId, offset, length),
        )
      },
      release(trackId, before) {
        return withAbortCheck(() => fragmentSamples.release(trackId, before))
      },
    },
  )
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
