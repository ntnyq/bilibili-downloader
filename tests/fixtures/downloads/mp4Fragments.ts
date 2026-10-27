import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { CustomSource } from 'mediabunny'

function join(parts: Uint8Array[]) {
  const result = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}
function words(...values: number[]) {
  const result = new Uint8Array(values.length * 4)
  const view = new DataView(result.buffer)
  values.forEach((value, index) => view.setUint32(index * 4, value))
  return result
}
function box(name: string, data: Uint8Array) {
  return join([words(8 + data.length), new TextEncoder().encode(name), data])
}
function header(name: string, size: number) {
  if (size <= 0xffff_ffff)
    return join([words(size), new TextEncoder().encode(name)])
  const data = join([
    words(1),
    new TextEncoder().encode(name),
    new Uint8Array(8),
  ])
  new DataView(data.buffer).setBigUint64(8, BigInt(size))
  return data
}
function boxes(data: Uint8Array) {
  const entries: { name: string; data: Uint8Array; payload: Uint8Array }[] = []
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  for (let offset = 0; offset < data.length;) {
    const size = view.getUint32(offset)
    assert.ok(size >= 8 && offset + size <= data.length)
    entries.push({
      name: new TextDecoder().decode(data.subarray(offset + 4, offset + 8)),
      data: data.slice(offset, offset + size),
      payload: data.slice(offset + 8, offset + size),
    })
    offset += size
  }
  return entries
}

/** Generates fragments and TFRA rows on demand, without per-fragment arrays. */
export async function fragmentedMp4({
  fragments = 4099,
  indexed = true,
  tfdt = true,
  version = 1,
  widths = [1, 1, 1],
  tracks = 1,
  shorterTrackFragments = fragments,
  padding = 0,
  indexPadding = 0,
  reordered = false,
  multipleRuns = false,
  recordReads = true,
  indexReference = 0,
  compositionShift = 0,
}: {
  fragments?: number
  indexed?: boolean
  tfdt?: boolean
  version?: 0 | 1
  widths?: readonly [number, number, number]
  tracks?: 1 | 2
  shorterTrackFragments?: number
  padding?: number
  indexPadding?: number
  reordered?: boolean
  multipleRuns?: boolean
  recordReads?: boolean
  indexReference?: number
  compositionShift?: number
} = {}) {
  const samplesPerFragment = 3
  const original = boxes(
    new Uint8Array(await readFile(new URL('./audio.m4a', import.meta.url))),
  )
  const ftyp = original.find(entry => entry.name === 'ftyp')!.data
  const originalMoov = original.find(entry => entry.name === 'moov')!.payload
  const trackCounts =
    tracks === 1 ? [fragments] : [fragments, shorterTrackFragments]
  assert.ok(trackCounts.every(count => count > 0 && count <= fragments))
  function rewrite(data: Uint8Array, trackId: number): Uint8Array {
    return join(
      boxes(data).flatMap(entry => {
        if (entry.name === 'edts') return []
        if (entry.name === 'stbl') {
          const stsd = boxes(entry.payload).find(
            child => child.name === 'stsd',
          )!.data
          return [
            box(
              'stbl',
              join([
                stsd,
                box('stts', words(0, 0)),
                box('stsc', words(0, 0)),
                box('stsz', words(0, 0, 0)),
                box('stco', words(0, 0)),
              ]),
            ),
          ]
        }
        if (entry.name === 'trak')
          return trackCounts.map((_, index) =>
            box('trak', rewrite(entry.payload, index + 1)),
          )
        if (['mdia', 'minf'].includes(entry.name))
          return [box(entry.name, rewrite(entry.payload, trackId))]
        const view = new DataView(entry.payload.buffer)
        if (entry.name === 'mvhd') view.setUint32(16, 0)
        if (entry.name === 'tkhd') {
          view.setUint32(12, trackId)
          view.setUint32(20, 0)
        }
        if (entry.name === 'mdhd') {
          view.setUint32(12, 48000)
          view.setUint32(16, 0)
        }
        return [box(entry.name, entry.payload)]
      }),
    )
  }
  const moov = box(
    'moov',
    join([
      rewrite(originalMoov, 1),
      box(
        'mvex',
        join(
          trackCounts.map((_, index) =>
            box('trex', words(0, index + 1, 1, 1024, 4, 0)),
          ),
        ),
      ),
    ]),
  )
  const init = join([ftyp, moov])
  const fragmentStart = init.length + padding
  const totalFragments = trackCounts.reduce((sum, count) => sum + count, 0)
  const entrySize =
    (version === 1 ? 16 : 8) + widths.reduce((sum, value) => sum + value, 0)
  const physicalIndex = (track: number, index: number) =>
    tracks === 1
      ? index
      : track === 2
        ? index * 2 + 1
        : index < shorterTrackFragments
          ? index * 2
          : index + shorterTrackFragments
  const location = (index: number) =>
    tracks === 1
      ? { track: 1, index }
      : index < shorterTrackFragments * 2
        ? { track: (index % 2) + 1, index: Math.floor(index / 2) }
        : { track: 1, index: index - shorterTrackFragments }
  const packet = (track: number, index: number) =>
    words(track * 0x0100_0000 + index)
  const relativeTimestamp = (index: number) =>
    compositionShift + (reordered ? [2048, 0, 1024][index]! : index * 1024)
  function fragment(globalIndex: number) {
    const { track, index } = location(globalIndex)
    const tfhd = box('tfhd', words(0x020000, track))
    const decode = new Uint8Array(8)
    new DataView(decode.buffer).setBigUint64(
      0,
      BigInt(index * samplesPerFragment * 1024),
    )
    const tfdtBox = tfdt
      ? box('tfdt', join([words(0x0100_0000), decode]))
      : new Uint8Array(0)
    function trun(from: number, count: number, offset: number) {
      const entries = Array.from({ length: count }, (_, at) => {
        const sample = from + at
        return words(
          sample === 1 ? 0x0001_0000 : 0,
          relativeTimestamp(sample) - sample * 1024,
        )
      })
      return box('trun', join([words(0x0100_0c01, count, offset), ...entries]))
    }
    function moof(offset: number) {
      const runs = multipleRuns
        ? [trun(0, 1, offset), trun(1, 2, offset + 4)]
        : [trun(0, 3, offset)]
      return box(
        'moof',
        join([
          box('mfhd', words(0, globalIndex + 1)),
          box('traf', join([tfhd, tfdtBox, ...runs])),
        ]),
      )
    }
    const data = box(
      'mdat',
      join(
        Array.from({ length: samplesPerFragment }, (_, at) =>
          packet(track, index * samplesPerFragment + at),
        ),
      ),
    )
    const movie = moof(moof(0).length + 8)
    return join([movie, data])
  }
  const stride = fragment(0).length
  const mfraStart = fragmentStart + totalFragments * stride
  let indexOffset = mfraStart + 8 + indexPadding
  const indexes = trackCounts.map((count, at) => {
    const size = 24 + count * entrySize
    const offset = indexOffset
    indexOffset += size
    return {
      track: at + 1,
      count,
      start: offset,
      end: offset + size,
      entries: offset + 24,
    }
  })
  const mfraSize = indexed ? indexOffset + 16 - mfraStart : 0
  const size = mfraStart + mfraSize
  const reads: { start: number; end: number }[] = []
  const requests: { start: number; end: number }[] = []
  const patches = new Map<number, Uint8Array>()
  function readRange(start: number, end: number) {
    const result = new Uint8Array(end - start)
    function copy(offset: number, data: Uint8Array) {
      const from = Math.max(start, offset)
      const to = Math.min(end, offset + data.length)
      if (from < to)
        result.set(data.subarray(from - offset, to - offset), from - start)
    }
    copy(0, init)
    if (padding) copy(init.length, header('free', padding))
    const first = Math.max(0, Math.floor((start - fragmentStart) / stride))
    const last = Math.min(
      totalFragments,
      Math.ceil((end - fragmentStart) / stride),
    )
    for (let at = first; at < last; at++)
      copy(fragmentStart + at * stride, fragment(at))
    if (indexed) {
      copy(mfraStart, header('mfra', mfraSize))
      if (indexPadding) copy(mfraStart + 8, header('free', indexPadding))
      for (const table of indexes) {
        const word = (widths[0] - 1) * 16 + (widths[1] - 1) * 4 + widths[2] - 1
        copy(
          table.start,
          join([
            header('tfra', table.end - table.start),
            words(version * 0x0100_0000, table.track, word, table.count),
          ]),
        )
        const from = Math.max(
          0,
          Math.floor((start - table.entries) / entrySize),
        )
        const to = Math.min(
          table.count,
          Math.ceil((end - table.entries) / entrySize),
        )
        for (let entry = from; entry < to; entry++) {
          const data = new Uint8Array(entrySize)
          let offset = 0
          function write(value: number, width: number) {
            for (let at = width - 1; at >= 0; at--) {
              data[offset + at] = value % 256
              value = Math.floor(value / 256)
            }
            offset += width
          }
          write(
            entry * 3072 + relativeTimestamp(indexReference),
            version === 1 ? 8 : 4,
          )
          write(
            fragmentStart + physicalIndex(table.track, entry) * stride,
            version === 1 ? 8 : 4,
          )
          write(1, widths[0])
          write(multipleRuns && indexReference > 0 ? 2 : 1, widths[1])
          write(
            multipleRuns && indexReference > 0
              ? indexReference
              : indexReference + 1,
            widths[2],
          )
          copy(table.entries + entry * entrySize, data)
        }
      }
      copy(size - 16, box('mfro', words(0, mfraSize)))
    }
    for (const [offset, data] of patches) copy(offset, data)
    return result
  }
  const source = new CustomSource({
    getSize: () => size,
    maxCacheSize: 128 * 1024,
    prefetchProfile: 'none',
    async read(start, end) {
      if (recordReads) reads.push({ start, end })
      assert.ok(
        end - start <= 256 * 1024,
        `Unbounded source read: ${end - start}`,
      )
      await Promise.resolve()
      return readRange(start, end)
    },
  })
  const read: unknown = Reflect.get(source, '_read')
  assert.equal(typeof read, 'function')
  if (typeof read !== 'function') throw new TypeError('Missing source reader')
  Object.defineProperty(source, '_read', {
    configurable: true,
    value(start: number, end: number, ...args: unknown[]) {
      if (recordReads) requests.push({ start, end })
      assert.ok(
        end - start <= 64 * 1024,
        `Unbounded parser read: ${end - start}`,
      )
      if (indexes.some(table => start >= table.entries && end <= table.end))
        assert.ok(end - start <= 16 * 1024)
      return Reflect.apply(read, source, [start, end, ...args])
    },
  })
  return {
    source,
    reads,
    requests,
    patches,
    indexes,
    entrySize,
    size,
    fragmentStart,
    stride,
    mfraStart,
    fragments,
    trackCounts,
    samplesPerFragment,
    packet,
    initBlob: () => new Blob([init]),
    segmentBlob: () => new Blob([readRange(fragmentStart, mfraStart)]),
    timestamp: (index: number) =>
      (Math.floor(index / 3) * 3072 + relativeTimestamp(index % 3)) / 48000,
    fragmentOffset: (track: number, index: number) =>
      fragmentStart + physicalIndex(track, index) * stride,
    blob() {
      assert.ok(size < 64 * 1024 * 1024)
      return new Blob([readRange(0, size)])
    },
  }
}
