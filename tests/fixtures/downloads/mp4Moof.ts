import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createCipheriv } from 'node:crypto'
import { CustomSource } from 'mediabunny'
import { fragmentedMp4 } from './mp4Fragments'

export function moofWords(...values: number[]) {
  const bytes = new Uint8Array(values.length * 4)
  const view = new DataView(bytes.buffer)
  values.forEach((value, index) => view.setUint32(index * 4, value))
  return bytes
}
function join(parts: Uint8Array[]) {
  const bytes = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}
function header(name: string, size: number) {
  const bytes = join([
    moofWords(size > 0xffff_ffff ? 1 : size),
    new TextEncoder().encode(name),
    ...(size > 0xffff_ffff ? [new Uint8Array(8)] : []),
  ])
  if (size > 0xffff_ffff)
    new DataView(bytes.buffer).setBigUint64(8, BigInt(size))
  return bytes
}
function box(name: string, bytes: Uint8Array) {
  return join([header(name, bytes.length + 8), bytes])
}

/** One sparse moof; both metadata rows and media bytes are generated on demand. */
export async function largeMoof({
  samples = 5003,
  runSize = samples,
  order = 'forward',
  defaults = false,
  padding = 0,
  recordReads = true,
  version = 1,
  zeroDuration = false,
  bufferPages = false,
}: {
  samples?: number
  runSize?: number
  order?: 'forward' | 'reverse' | 'shuffle' | 'ties'
  defaults?: boolean
  padding?: number
  recordReads?: boolean
  version?: 0 | 1
  zeroDuration?: boolean
  bufferPages?: boolean
} = {}) {
  const initFixture = await fragmentedMp4({ fragments: 1 })
  const init = new Uint8Array(await initFixture.initBlob().arrayBuffer())
  const rowSize = defaults ? 0 : 16
  const runs = Math.ceil(samples / runSize)
  const runBytes = 24 + rowSize * runSize
  const allRunsSize = 24 * runs + rowSize * samples
  const tfhdSize = 36
  const trafSize = 8 + tfhdSize + 20 + allRunsSize
  const contentSize = 16 + padding + trafSize
  const moofSize = contentSize + (contentSize + 8 > 0xffff_ffff ? 16 : 8)
  const moofStart = init.length
  const moofHeader = header('moof', moofSize)
  const trafStart = moofStart + moofHeader.length + 16 + padding
  const runStart = trafStart + 8 + tfhdSize + 20
  const cumulative = (index: number) =>
    3 * Math.floor(index / 3) + ((index % 3) * ((index % 3) - 1)) / 2
  const decode = (index: number) =>
    zeroDuration ? 0 : index * 1024 + (defaults ? 0 : cumulative(index))
  const byteOffset = (index: number) =>
    index * 4 + (defaults ? 0 : cumulative(index))
  const mdatSize =
    byteOffset(samples) + (byteOffset(samples) + 8 > 0xffff_ffff ? 16 : 8)
  const mediaStart = moofStart + moofSize + header('mdat', mdatSize).length
  const duration = (index: number) =>
    zeroDuration ? 0 : 1024 + (defaults ? 0 : index % 3)
  const pts = (index: number) => {
    if (order === 'reverse') return (samples - 1 - index) * 1024
    if (order === 'ties') return Math.floor(index / 3) * 1024
    if (order === 'shuffle') {
      const block = Math.floor(index / 257) * 257
      const length = Math.min(257, samples - block)
      return (block + (((index - block) * 17) % length)) * 1024
    }
    return decode(index)
  }
  const isKey = (index: number) =>
    index % runSize === 0 || (!defaults && index % 17 === 0)
  const packet = (index: number) => {
    const data = new Uint8Array(4 + (defaults ? 0 : index % 3))
    data.set(moofWords(index))
    return data
  }
  const fixed = new Map<number, Uint8Array>([
    [0, init],
    [moofStart, moofHeader],
    [moofStart + moofHeader.length, box('mfhd', moofWords(0, 1))],
    [trafStart, header('traf', trafSize)],
    [
      trafStart + 8,
      box(
        'tfhd',
        join([
          moofWords(0x39, 1),
          new Uint8Array(8),
          moofWords(zeroDuration ? 0 : 1024, 4, 0x10000),
        ]),
      ),
    ],
    [
      trafStart + 8 + tfhdSize,
      box('tfdt', join([moofWords(0x01000000), new Uint8Array(8)])),
    ],
    [moofStart + moofSize, header('mdat', mdatSize)],
  ])
  new DataView(fixed.get(trafStart + 8)!.buffer).setBigUint64(
    16,
    BigInt(mediaStart),
  )
  if (padding)
    fixed.set(moofStart + moofHeader.length + 16, header('free', padding))
  const size = mediaStart + byteOffset(samples)
  const patches = new Map<number, Uint8Array>()
  const requests: { start: number; end: number }[] = []
  function readRange(start: number, end: number) {
    const result = new Uint8Array(end - start)
    function copy(position: number, bytes: Uint8Array) {
      const from = Math.max(start, position),
        to = Math.min(end, position + bytes.length)
      if (to > from)
        result.set(bytes.subarray(from - position, to - position), from - start)
    }
    for (const [position, bytes] of fixed) copy(position, bytes)
    if (end > runStart && start < runStart + allRunsSize) {
      const first = Math.max(0, Math.floor((start - runStart) / runBytes))
      const last = Math.min(runs - 1, Math.floor((end - runStart) / runBytes))
      for (let run = first; run <= last; run++) {
        const index = run * runSize,
          count = Math.min(runSize, samples - index)
        const position = runStart + run * runBytes
        copy(
          position,
          join([
            header('trun', 24 + count * rowSize),
            moofWords(
              version * 0x1000000 + (defaults ? 5 : 0xf05),
              count,
              byteOffset(index),
              0,
            ),
          ]),
        )
        if (!defaults) {
          const from = Math.max(
            index,
            index + Math.floor((start - position - 24) / rowSize),
          )
          const to = Math.min(
            index + count,
            index + Math.ceil((end - position - 24) / rowSize),
          )
          for (let at = from; at < to; at++)
            copy(
              position + 24 + (at - index) * rowSize,
              moofWords(
                duration(at),
                packet(at).length,
                isKey(at) ? 0 : 0x10000,
                pts(at) - decode(at),
              ),
            )
        }
      }
    }
    if (end > mediaStart) {
      // At most one extra sample at either edge; byteOffset is monotonic.
      let index = Math.max(
        0,
        Math.floor((start - mediaStart) / (defaults ? 4 : 5)) - 2,
      )
      while (index < samples && mediaStart + byteOffset(index) < end) {
        copy(mediaStart + byteOffset(index), packet(index))
        index++
      }
    }
    for (const [position, bytes] of patches) copy(position, bytes)
    return result
  }
  const source = new CustomSource({
    getSize: () => size,
    maxCacheSize: 128 * 1024,
    prefetchProfile: 'none',
    async read(start, end) {
      assert.ok(
        end - start <= 256 * 1024,
        `Unbounded source read: ${end - start}`,
      )
      const data = readRange(start, end)
      return data
    },
  })
  const read: unknown = Reflect.get(source, '_read')
  assert.equal(typeof read, 'function')
  if (typeof read !== 'function') throw new TypeError('Missing reader')
  Object.defineProperty(source, '_read', {
    configurable: true,
    async value(start: number, end: number, ...args: unknown[]) {
      if (recordReads) requests.push({ start, end })
      assert.ok(
        end - start <= 64 * 1024,
        `Unbounded parser read: ${end - start}`,
      )
      const result: unknown = await Reflect.apply(read, source, [
        start,
        end,
        ...args,
      ])
      if (!bufferPages || end - start <= 16) return result
      assert.ok(result && typeof result === 'object')
      const bytes: unknown = Reflect.get(result, 'bytes'),
        offset: unknown = Reflect.get(result, 'offset')
      assert.ok(bytes instanceof Uint8Array)
      if (typeof offset !== 'number')
        throw new TypeError('Missing source offset')
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
  return {
    source,
    requests,
    patches,
    size,
    samples,
    runStart,
    runBytes,
    moofStart,
    mediaStart,
    packet,
    pts,
    duration,
    isKey,
    blob: () => {
      assert.ok(size < 64 * 1024 * 1024)
      return new Blob([readRange(0, size)])
    },
  }
}

/** Small encrypted fixture for on-demand IV and auxiliary-size page coverage. */
export async function encryptedMoof(
  mode: 'senc' | 'senc-subsamples' | 'aux' | 'aux-fixed',
) {
  const fixture = await largeMoof({ samples: 5003, runSize: 1001 })
  const original = new Uint8Array(await fixture.blob().arrayBuffer())
  const key = new Uint8Array(16).fill(0x39)
  function children(bytes: Uint8Array) {
    const entries: { name: string; bytes: Uint8Array }[] = []
    for (let at = 0; at < bytes.length;) {
      const size = new DataView(bytes.buffer, bytes.byteOffset + at).getUint32(
        0,
      )
      entries.push({
        name: new TextDecoder().decode(bytes.subarray(at + 4, at + 8)),
        bytes: bytes.slice(at, at + size),
      })
      at += size
    }
    return entries
  }
  const sinf = box(
    'sinf',
    join([
      box('frma', new TextEncoder().encode('mp4a')),
      box(
        'schm',
        join([
          moofWords(0),
          new TextEncoder().encode('cenc'),
          moofWords(0x10000),
        ]),
      ),
      box(
        'schi',
        box(
          'tenc',
          join([
            moofWords(0),
            Uint8Array.of(0, 0, 1, 8),
            new Uint8Array(16).fill(0x17),
          ]),
        ),
      ),
    ]),
  )
  function rewrite(bytes: Uint8Array): Uint8Array {
    return join(
      children(bytes).map(entry => {
        if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(entry.name))
          return box(entry.name, rewrite(entry.bytes.subarray(8)))
        if (entry.name === 'stsd') {
          const sample = children(entry.bytes.subarray(16))[0]!
          return box(
            'stsd',
            join([
              entry.bytes.subarray(8, 16),
              box('enca', join([sample.bytes.subarray(8), sinf])),
            ]),
          )
        }
        return entry.bytes
      }),
    )
  }
  const init = rewrite(original.subarray(0, fixture.moofStart))
  const subsamples = mode === 'senc-subsamples' || mode === 'aux'
  const records: Uint8Array[] = [],
    packets: Uint8Array[] = []
  for (let index = 0; index < fixture.samples; index++) {
    const iv = new Uint8Array(16)
    new DataView(iv.buffer).setBigUint64(0, BigInt(index + 1))
    const plain = fixture.packet(index),
      clear = subsamples ? 1 : 0
    const cipher = createCipheriv('aes-128-ctr', key, iv)
    packets.push(
      join([
        plain.subarray(0, clear),
        cipher.update(plain.subarray(clear)),
        cipher.final(),
      ]),
    )
    const sizes = new Uint8Array(2 + (index % 2 ? 12 : 6)),
      view = new DataView(sizes.buffer)
    view.setUint16(0, index % 2 ? 2 : 1)
    view.setUint16(2, clear)
    view.setUint32(4, index % 2 ? 1 : plain.length - clear)
    if (index % 2) view.setUint32(10, plain.length - clear - 1)
    records.push(join([iv.subarray(0, 8), ...(subsamples ? [sizes] : [])]))
  }
  const bytes = join(records)
  const isAux = mode.startsWith('aux')
  const extra = isAux
    ? join([
        box(
          'saiz',
          join([
            moofWords(0),
            Uint8Array.of(subsamples ? 0 : 8),
            moofWords(fixture.samples),
            ...(subsamples
              ? [Uint8Array.from(records, record => record.length)]
              : []),
          ]),
        ),
        box('saio', moofWords(0, 1, 0)),
      ])
    : box('senc', join([moofWords(subsamples ? 2 : 0, fixture.samples), bytes]))
  const moof = original.slice(fixture.moofStart, fixture.mediaStart - 8)
  const trafAt = 24
  const withExtra = join([moof, extra])
  const view = new DataView(withExtra.buffer)
  view.setUint32(0, withExtra.length)
  view.setUint32(trafAt, view.getUint32(trafAt) + extra.length)
  view.setBigUint64(
    trafAt + 8 + 16,
    BigInt(init.length + withExtra.length + 8 + (isAux ? bytes.length : 0)),
  )
  if (isAux) view.setUint32(withExtra.length - 4, withExtra.length + 8)
  const output = join([
    init,
    withExtra,
    box('mdat', join([...(isAux ? [bytes] : []), ...packets])),
  ])
  const requests: { start: number; end: number }[] = []
  const source = new CustomSource({
    getSize: () => output.length,
    maxCacheSize: 128 * 1024,
    prefetchProfile: 'none',
    read(start, end) {
      assert.ok(end - start <= 256 * 1024)
      return output.slice(start, end)
    },
  })
  const read: unknown = Reflect.get(source, '_read')
  assert.equal(typeof read, 'function')
  if (typeof read !== 'function') throw new TypeError('Missing source reader')
  Object.defineProperty(source, '_read', {
    value(start: number, end: number, ...args: unknown[]) {
      requests.push({ start, end })
      assert.ok(end - start <= 64 * 1024)
      return Reflect.apply(read, source, [start, end, ...args])
    },
  })
  return { ...fixture, source, key, requests }
}
