import type { IsobmffOutputFormatOptions } from 'mediabunny'

export type FragmentSampleStore = NonNullable<
  IsobmffOutputFormatOptions['_fragmentSampleStore']
>
export type FragmentSample = Awaited<ReturnType<FragmentSampleStore['get']>>

/**
 * Positional temporary file; implementations may use synchronous Worker I/O.
 */
export interface FragmentSampleFile {
  read: (
    data: Uint8Array<ArrayBuffer>,
    position: number,
  ) => number | Promise<number>
  write: (
    data: Uint8Array<ArrayBuffer>,
    position: number,
  ) => number | Promise<number>
  truncate: (size: number) => void | Promise<void>
  close: () => void | Promise<void>
}

const RECORD_SIZE = 56
const RECORDS_PER_PAGE = 1024
const PAGE_SIZE = RECORD_SIZE * RECORDS_PER_PAGE
const IO_SIZE = 64 * 1024
const SORT_RUN = 4096

type FileKind = 'records' | 'media' | 'sort-a' | 'sort-b'
interface Page {
  index: number
  bytes: Uint8Array<ArrayBuffer>
  dirty: boolean
}
interface Track {
  files: Record<FileKind, FragmentSampleFile>
  pages: Page[]
  base: number
  end: number
  recordBytes: number
  mediaBase: number
  mediaEnd: number
  mediaBuffer: Uint8Array<ArrayBuffer>
  mediaUsed: number
  mediaWritten: number
  sortedCount: number
  sortedMemory: Float64Array<ArrayBuffer>
  externalSort: boolean
  sortedFile: 'sort-a' | 'sort-b'
  sortedPage: { offset: number; bytes: Uint8Array<ArrayBuffer> } | undefined
}

/**
 * Two descriptor pages per track, fixed-size external merge sorting, and
 * bounded media pages. Released prefixes are compacted so old fragments do not
 * accumulate. A failed operation poisons the store, while disposal always
 * closes every file.
 *
 * @param open - Async opener for each track and records/media/sort file kind;
 * returned files must support positional I/O, truncation, and closure.
 * @returns A serialized sample store supporting append, get/set, bounded
 * timestamp sorting, media reads, prefix release, and disposal.
 * @remarks Files open lazily. Operations reject invalid track/sample/range
 *   values with RangeError, reject use after disposal with InvalidStateError,
 *   and propagate I/O errors. The first failed operation poisons subsequent
 *   work; dispose still attempts to close every file.
 */
export function createDiskFragmentSamples(
  open: (trackId: number, kind: FileKind) => Promise<FragmentSampleFile>,
) {
  const tracks = new Map<number, Track>()
  let queue = Promise.resolve()
  let failure: { error: unknown } | undefined
  let disposed = false
  let disposal: Promise<void> | undefined

  function enqueueOperation<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    if (disposed) {
      return Promise.reject(
        new DOMException('样本暂存已关闭。', 'InvalidStateError'),
      )
    }
    const result = queue.then(() => {
      if (failure) {
        throw failure.error
      }
      return operation()
    })
    queue = result
      .then(() => {})
      .catch(error => {
        failure ??= { error }
      })
    return result
  }

  async function transferFileBytes(
    file: FragmentSampleFile,
    bytes: Uint8Array<ArrayBuffer>,
    position: number,
    writing: boolean,
  ) {
    let consumed = 0
    while (consumed < bytes.length) {
      const remaining = bytes.subarray(consumed)
      const count = await (writing
        ? file.write(remaining, position + consumed)
        : file.read(remaining, position + consumed))
      if (!Number.isInteger(count) || count <= 0 || count > remaining.length) {
        throw new RangeError('样本暂存文件读写不完整。')
      }
      consumed += count
    }
  }

  async function getTrack(trackId: number) {
    if (!Number.isInteger(trackId) || trackId < 1 || trackId > 0xffff_ffff) {
      throw new RangeError('样本轨道编号无效。')
    }
    let track = tracks.get(trackId)
    if (track) {
      return track
    }
    const opened: FragmentSampleFile[] = []
    try {
      const getFile = async (kind: FileKind) => {
        const file = await open(trackId, kind)
        opened.push(file)
        await file.truncate(0)
        return file
      }
      const files = {
        records: await getFile('records'),
        media: await getFile('media'),
        'sort-a': await getFile('sort-a'),
        'sort-b': await getFile('sort-b'),
      }
      track = {
        files,
        pages: [],
        base: 0,
        end: 0,
        recordBytes: 0,
        mediaBase: 0,
        mediaEnd: 0,
        mediaBuffer: new Uint8Array(IO_SIZE),
        mediaUsed: 0,
        mediaWritten: 0,
        sortedCount: 0,
        sortedMemory: new Float64Array(SORT_RUN),
        externalSort: false,
        sortedFile: 'sort-a',
        sortedPage: undefined,
      }
      tracks.set(trackId, track)
      return track
    } catch (error) {
      for (const file of opened) {
        await Promise.resolve()
          .then(() => file.close())
          .catch(() => {})
      }
      throw error
    }
  }

  async function flushPage(track: Track, page: Page) {
    if (!page.dirty) {
      return
    }
    const length = Math.min(
      PAGE_SIZE,
      (track.end - track.base) * RECORD_SIZE - page.index * PAGE_SIZE,
    )
    if (length > 0) {
      await transferFileBytes(
        track.files.records,
        page.bytes.subarray(0, length),
        page.index * PAGE_SIZE,
        true,
      )
    }
    track.recordBytes = Math.max(
      track.recordBytes,
      page.index * PAGE_SIZE + length,
    )
    page.dirty = false
  }

  async function getSamplePage(track: Track, id: number) {
    if (!Number.isSafeInteger(id) || id < track.base || id >= track.end) {
      throw new RangeError('样本暂存引用无效。')
    }
    const index = Math.floor((id - track.base) / RECORDS_PER_PAGE)
    let page = track.pages.find(page => page.index === index)
    if (page) {
      track.pages.splice(track.pages.indexOf(page), 1)
      track.pages.push(page)
      return page
    }
    if (track.pages.length === 2) {
      const oldest = track.pages.shift()!
      await flushPage(track, oldest)
    }
    page = { index, bytes: new Uint8Array(PAGE_SIZE), dirty: false }
    // The last record may be a just-appended slot not written yet.
    const written = Math.min(
      PAGE_SIZE,
      Math.max(0, track.recordBytes - index * PAGE_SIZE),
    )
    if (written > 0) {
      await transferFileBytes(
        track.files.records,
        page.bytes.subarray(0, written),
        index * PAGE_SIZE,
        false,
      )
    }
    track.pages.push(page)
    return page
  }

  function getSampleView(track: Track, page: Page, id: number) {
    return new DataView(
      page.bytes.buffer,
      ((id - track.base) % RECORDS_PER_PAGE) * RECORD_SIZE,
      RECORD_SIZE,
    )
  }

  function isNonnegativeSafeInteger(value: number) {
    return Number.isSafeInteger(value) && value >= 0
  }

  function assertValidSample(sample: FragmentSample) {
    if (
      ![sample.timestamp, sample.decodeTimestamp, sample.duration].every(
        Number.isFinite,
      )
      || sample.duration < 0
      || !isNonnegativeSafeInteger(sample.size)
      || sample.size > 0xffff_ffff
      || !isNonnegativeSafeInteger(sample.timescaleUnitsToNextSample)
      || !isNonnegativeSafeInteger(sample.mediaOffset)
      || !['key', 'delta'].includes(sample.type)
    ) {
      throw new RangeError('样本暂存字段无效。')
    }
  }

  async function get(track: Track, id: number): Promise<FragmentSample> {
    const page = await getSamplePage(track, id)
    const view = getSampleView(track, page, id)
    const type = view.getUint8(48)
    if (type > 1) {
      throw new RangeError('样本暂存类型无效。')
    }
    const sample: FragmentSample = {
      timestamp: view.getFloat64(0),
      decodeTimestamp: view.getFloat64(8),
      duration: view.getFloat64(16),
      size: view.getFloat64(24),
      timescaleUnitsToNextSample: view.getFloat64(32),
      mediaOffset: view.getFloat64(40),
      type: type ? 'key' : 'delta',
    }
    assertValidSample(sample)
    return sample
  }

  async function set(track: Track, id: number, sample: FragmentSample) {
    // A later GOP can refine the previous last duration after its fragment was
    // already emitted. That old mutation must not resurrect a released record.
    if (id < track.base) {
      return
    }
    assertValidSample(sample)
    const page = await getSamplePage(track, id)
    const view = getSampleView(track, page, id)
    view.setFloat64(0, sample.timestamp)
    view.setFloat64(8, sample.decodeTimestamp)
    view.setFloat64(16, sample.duration)
    view.setFloat64(24, sample.size)
    view.setFloat64(32, sample.timescaleUnitsToNextSample)
    view.setFloat64(40, sample.mediaOffset)
    view.setUint8(48, sample.type === 'key' ? 1 : 0)
    page.dirty = true
  }

  async function flushMedia(track: Track) {
    if (!track.mediaUsed) {
      return
    }
    await transferFileBytes(
      track.files.media,
      track.mediaBuffer.subarray(0, track.mediaUsed),
      track.mediaWritten,
      true,
    )
    track.mediaWritten += track.mediaUsed
    track.mediaUsed = 0
  }

  async function compactFile(
    file: FragmentSampleFile,
    consumed: number,
    total: number,
  ) {
    const buffer = new Uint8Array(IO_SIZE)
    for (let offset = consumed; offset < total; offset += IO_SIZE) {
      const bytes = buffer.subarray(0, Math.min(IO_SIZE, total - offset))
      await transferFileBytes(file, bytes, offset, false)
      await transferFileBytes(file, bytes, offset - consumed, true)
    }
    await file.truncate(total - consumed)
  }

  return {
    append(
      trackId: number,
      sample: Omit<FragmentSample, 'mediaOffset'>,
      data: Uint8Array,
    ) {
      return enqueueOperation(async () => {
        const track = await getTrack(trackId)
        const record = { ...sample, mediaOffset: track.mediaEnd }
        assertValidSample(record)
        if (
          data.length !== sample.size
          || !Number.isSafeInteger((track.end + 1) * RECORD_SIZE)
          || !Number.isSafeInteger(track.mediaEnd + data.length)
        ) {
          throw new RangeError('样本暂存大小无效。')
        }
        for (let offset = 0; offset < data.length;) {
          const length = Math.min(
            data.length - offset,
            IO_SIZE - track.mediaUsed,
          )
          track.mediaBuffer.set(
            data.subarray(offset, offset + length),
            track.mediaUsed,
          )
          track.mediaUsed += length
          offset += length
          if (track.mediaUsed === IO_SIZE) {
            await flushMedia(track)
          }
        }
        track.mediaEnd += data.length
        const id = track.end++
        await set(track, id, record)
        return id
      })
    },
    get(trackId: number, id: number) {
      return enqueueOperation(async () => get(await getTrack(trackId), id))
    },
    set(trackId: number, id: number, sample: FragmentSample) {
      return enqueueOperation(async () =>
        set(await getTrack(trackId), id, sample),
      )
    },
    sort(trackId: number, start: number, count: number) {
      return enqueueOperation(async () => {
        const track = await getTrack(trackId)
        if (
          !Number.isSafeInteger(count)
          || count < 1
          || start < track.base
          || start + count > track.end
        ) {
          throw new RangeError('GOP 暂存范围无效。')
        }
        track.sortedPage = undefined
        track.sortedCount = count
        if (count <= SORT_RUN) {
          for (let at = 0; at < count; at++) {
            track.sortedMemory[at] = (await get(track, start + at)).timestamp
          }
          track.sortedMemory.subarray(0, count).sort()
          return
        }
        track.externalSort = true
        let source: 'sort-a' | 'sort-b' = 'sort-a'
        let destination: 'sort-a' | 'sort-b' = 'sort-b'
        const values = track.sortedMemory
        for (let offset = 0; offset < count; offset += SORT_RUN) {
          const length = Math.min(SORT_RUN, count - offset)
          for (let at = 0; at < length; at++) {
            values[at] = (await get(track, start + offset + at)).timestamp
          }
          const enqueueOperation = values.subarray(0, length)
          enqueueOperation.sort()
          await transferFileBytes(
            track.files[source],
            new Uint8Array(
              enqueueOperation.buffer,
              enqueueOperation.byteOffset,
              enqueueOperation.byteLength,
            ),
            offset * 8,
            true,
          )
        }
        await track.files[source].truncate(count * 8)
        for (let width = SORT_RUN; width < count; width *= 2) {
          await track.files[destination].truncate(0)
          const output = new Float64Array(IO_SIZE / 8)
          let used = 0
          let written = 0
          const emit = async (value: number) => {
            output[used++] = value
            if (used === output.length) {
              await transferFileBytes(
                track.files[destination],
                new Uint8Array(
                  output.buffer,
                  output.byteOffset,
                  output.byteLength,
                ),
                written * 8,
                true,
              )
              written += used
              used = 0
            }
          }
          for (let offset = 0; offset < count; offset += width * 2) {
            const createSortCursor = (first: number, end: number) => {
              let at = first
              let loaded = 0
              let index = 0
              const bytes = new Uint8Array(IO_SIZE)
              const view = new Float64Array(
                bytes.buffer,
                bytes.byteOffset,
                bytes.byteLength / 8,
              )
              return {
                has: () => at < end,
                async peek() {
                  if (index === loaded) {
                    loaded = Math.min(view.length, end - at)
                    index = 0
                    await transferFileBytes(
                      track.files[source],
                      bytes.subarray(0, loaded * 8),
                      at * 8,
                      false,
                    )
                  }
                  return view[index]!
                },
                next() {
                  at++
                  index++
                },
              }
            }
            const left = createSortCursor(
              offset,
              Math.min(offset + width, count),
            )
            const right = createSortCursor(
              Math.min(offset + width, count),
              Math.min(offset + width * 2, count),
            )
            while (left.has() || right.has()) {
              if (
                !right.has()
                || (left.has() && (await left.peek()) <= (await right.peek()))
              ) {
                await emit(await left.peek())
                left.next()
              } else {
                await emit(await right.peek())
                right.next()
              }
            }
          }
          if (used) {
            await transferFileBytes(
              track.files[destination],
              new Uint8Array(output.buffer, output.byteOffset, used * 8),
              written * 8,
              true,
            )
          }
          ;[source, destination] = [destination, source]
        }
        track.sortedFile = source
        track.sortedCount = count
      })
    },
    sorted(trackId: number, index: number) {
      return enqueueOperation(async () => {
        const track = await getTrack(trackId)
        if (
          !Number.isInteger(index)
          || index < 0
          || index >= track.sortedCount
        ) {
          throw new RangeError('排序时间戳引用无效。')
        }
        if (track.sortedCount <= SORT_RUN) {
          return track.sortedMemory[index]!
        }
        const offset = Math.floor((index * 8) / IO_SIZE) * IO_SIZE
        if (track.sortedPage?.offset !== offset) {
          const bytes = new Uint8Array(
            Math.min(IO_SIZE, track.sortedCount * 8 - offset),
          )
          await transferFileBytes(
            track.files[track.sortedFile],
            bytes,
            offset,
            false,
          )
          track.sortedPage = { offset, bytes }
        }
        return new Float64Array(
          track.sortedPage.bytes.buffer,
          track.sortedPage.bytes.byteOffset,
          track.sortedPage.bytes.byteLength / 8,
        )[(index * 8 - offset) / 8]!
      })
    },
    readMedia(trackId: number, offset: number, length: number) {
      return enqueueOperation(async () => {
        const track = await getTrack(trackId)
        if (
          !Number.isSafeInteger(offset)
          || offset < track.mediaBase
          || !Number.isInteger(length)
          || length < 0
          || length > IO_SIZE
          || offset + length > track.mediaEnd
        ) {
          throw new RangeError('样本媒体读取范围无效。')
        }
        await flushMedia(track)
        const bytes = new Uint8Array(length)
        await transferFileBytes(
          track.files.media,
          bytes,
          offset - track.mediaBase,
          false,
        )
        return bytes
      })
    },
    release(trackId: number, before: number) {
      return enqueueOperation(async () => {
        const track = await getTrack(trackId)
        if (
          !Number.isSafeInteger(before)
          || before < track.base
          || before > track.end
        ) {
          throw new RangeError('样本释放范围无效。')
        }
        if (before === track.base) {
          return
        }
        const last = await get(track, before - 1)
        for (const page of track.pages) {
          await flushPage(track, page)
        }
        track.pages = []
        await flushMedia(track)
        await compactFile(
          track.files.records,
          (before - track.base) * RECORD_SIZE,
          (track.end - track.base) * RECORD_SIZE,
        )
        const mediaBase = last.mediaOffset + last.size
        await compactFile(
          track.files.media,
          mediaBase - track.mediaBase,
          track.mediaEnd - track.mediaBase,
        )
        track.recordBytes = (track.end - before) * RECORD_SIZE
        track.base = before
        track.mediaBase = mediaBase
        track.mediaWritten = track.mediaEnd - mediaBase
        track.sortedCount = 0
        track.sortedPage = undefined
        if (track.externalSort) {
          await track.files['sort-a'].truncate(0)
          await track.files['sort-b'].truncate(0)
          track.externalSort = false
        }
      })
    },
    dispose() {
      disposed = true
      return (disposal ??= queue.then(async () => {
        let closeFailure: { error: unknown } | undefined
        for (const track of tracks.values()) {
          for (const file of Object.values(track.files)) {
            try {
              await file.close()
            } catch (error) {
              closeFailure ??= { error }
            }
          }
        }
        tracks.clear()
        if (closeFailure) {
          throw closeFailure.error
        }
      }))
    },
  }
}

interface WorkerFileHandle extends FileSystemFileHandle {
  createSyncAccessHandle: () => Promise<{
    read: (data: Uint8Array<ArrayBuffer>, options: { at: number }) => number
    write: (data: Uint8Array<ArrayBuffer>, options: { at: number }) => number
    truncate: (size: number) => void
    close: () => void
  }>
}

/**
 * Checks whether a Worker file handle exposes synchronous positional OPFS
 * access.
 *
 * @param handle - File handle returned by the temporary sample directory.
 * @returns Whether createSyncAccessHandle is callable, narrowing the handle to
 * WorkerFileHandle.
 */
function isSyncAccessFileHandle(
  handle: FileSystemFileHandle,
): handle is WorkerFileHandle {
  return (
    'createSyncAccessHandle' in handle
    && typeof handle.createSyncAccessHandle === 'function'
  )
}

/**
 * Dedicated Worker metadata files support positional updates without reopening
 * and copying the whole file. Handles stay private to one remux job.
 *
 * @param directory - Caller-owned remux directory used for per-track records,
 * media, and external-sort files.
 * @returns A lazily opened sample store backed by synchronous Worker OPFS
 * handles.
 * @remarks Store operations reject unsupported synchronous access, malformed
 *   sample data, and OPFS failures. Disposal closes every opened handle but
 *   leaves directory removal to the caller.
 */
export function createOpfsFragmentSamples(
  directory: FileSystemDirectoryHandle,
) {
  return createDiskFragmentSamples(async (trackId, kind) => {
    const handle = await directory.getFileHandle(
      `samples-${trackId}-${kind}.bin`,
      { create: true },
    )
    if (!isSyncAccessFileHandle(handle)) {
      throw new Error('浏览器不支持 Worker 样本磁盘暂存。')
    }
    const file = await handle.createSyncAccessHandle()
    return {
      read: (data, position) => file.read(data, { at: position }),
      write: (data, position) => file.write(data, { at: position }),
      truncate: size => file.truncate(size),
      close: () => file.close(),
    }
  })
}
