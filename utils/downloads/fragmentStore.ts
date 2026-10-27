const FRAGMENT_PAGE_SIZE = 64 * 1024

/**
 * Backing file for one track of temporary fragment bytes.
 */
export interface FragmentStoreFile {
  write: (data: Uint8Array<ArrayBuffer>, position: number) => Promise<number>
  read: (data: Uint8Array<ArrayBuffer>, position: number) => Promise<number>
  seal: () => Promise<void>
  close: () => Promise<void>
}

/**
 * Append bytes, then read bounded pages after sealing the current file.
 */
export interface FragmentStore {
  append: (trackId: number, data: Uint8Array) => Promise<void>
  read: (
    trackId: number,
    offset: number,
    length: number,
  ) => Promise<Uint8Array<ArrayBuffer>>
}

interface TrackFile {
  file: FragmentStoreFile
  buffer: Uint8Array<ArrayBuffer>
  used: number
  written: number
  sealed: boolean
}

/**
 * Keeps one write page per track and serializes I/O with caller backpressure.
 * Reading seals that track; reset/disposal discard pending bytes and close files.
 * Each open must truncate the logical file, including after a reset.
 */
export function createDiskFragmentStore(
  open: (trackId: number) => Promise<FragmentStoreFile>,
) {
  const tracks = new Map<number, TrackFile>()
  let queue = Promise.resolve()
  let failure: { error: unknown } | undefined
  let disposed = false
  let disposal: Promise<void> | undefined

  function run<Result>(operation: () => Promise<Result>): Promise<Result> {
    if (disposed) {
      return Promise.reject(
        new DOMException('片段暂存已关闭。', 'InvalidStateError'),
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

  async function getTrack(trackId: number) {
    if (!Number.isInteger(trackId) || trackId < 1 || trackId > 0xffff_ffff) {
      throw new RangeError('片段轨道编号无效。')
    }
    let track = tracks.get(trackId)
    if (!track) {
      const file = await open(trackId)
      track = {
        file,
        buffer: new Uint8Array(FRAGMENT_PAGE_SIZE),
        used: 0,
        written: 0,
        sealed: false,
      }
      tracks.set(trackId, track)
    }
    return track
  }

  async function flush(track: TrackFile) {
    let offset = 0
    while (offset < track.used) {
      const data = track.buffer.subarray(offset, track.used)
      const written = await track.file.write(data, track.written)
      if (!Number.isInteger(written) || written <= 0 || written > data.length) {
        throw new Error('片段暂存文件写入未取得进展。')
      }
      offset += written
      track.written += written
    }
    track.used = 0
  }

  return {
    append(trackId: number, data: Uint8Array) {
      return run(async () => {
        const track = await getTrack(trackId)
        if (track.sealed) {
          throw new DOMException(
            '片段暂存已进入读取阶段。',
            'InvalidStateError',
          )
        }
        if (!Number.isSafeInteger(track.written + track.used + data.length)) {
          throw new RangeError('片段暂存文件过大。')
        }
        let offset = 0
        while (offset < data.length) {
          const length = Math.min(
            data.length - offset,
            FRAGMENT_PAGE_SIZE - track.used,
          )
          track.buffer.set(data.subarray(offset, offset + length), track.used)
          track.used += length
          offset += length
          if (track.used === FRAGMENT_PAGE_SIZE) {
            await flush(track)
          }
        }
      })
    },
    read(trackId: number, offset: number, length: number) {
      return run(async () => {
        if (
          !Number.isSafeInteger(offset)
          || offset < 0
          || !Number.isInteger(length)
          || length < 0
          || length > FRAGMENT_PAGE_SIZE
        ) {
          throw new RangeError('片段暂存读取范围无效。')
        }
        const track = await getTrack(trackId)
        if (offset + length > track.written + track.used) {
          throw new RangeError('片段暂存文件不完整。')
        }
        if (!track.sealed) {
          await flush(track)
          await track.file.seal()
          track.sealed = true
        }
        const data = new Uint8Array(length)
        let consumed = 0
        while (consumed < length) {
          const remaining = data.subarray(consumed)
          const count = await track.file.read(remaining, offset + consumed)
          if (
            !Number.isInteger(count)
            || count <= 0
            || count > remaining.length
          ) {
            throw new RangeError('片段暂存文件读取不完整。')
          }
          consumed += count
        }
        return data
      })
    },
    reset(trackId: number) {
      return run(async () => {
        const track = tracks.get(trackId)
        if (track) {
          await track.file.close()
          tracks.delete(trackId)
        }
      })
    },
    dispose() {
      disposed = true
      return (disposal ??= queue.then(async () => {
        let closeFailure: { error: unknown } | undefined
        for (const track of tracks.values()) {
          try {
            await track.file.close()
          } catch (error) {
            closeFailure ??= { error }
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

/**
 * Uses temporary OPFS write streams, committing each track before paged reads.
 */
export function createOpfsFragmentStore(
  directory: FileSystemDirectoryHandle,
  filename: (trackId: number) => string,
) {
  return createDiskFragmentStore(async trackId => {
    const handle = await directory.getFileHandle(filename(trackId), {
      create: true,
    })
    let writer: FileSystemWritableFileStream | undefined =
      await handle.createWritable({ keepExistingData: false })
    let snapshot: File | undefined
    return {
      async write(data, position) {
        if (!writer) {
          throw new DOMException('片段暂存写流已关闭。', 'InvalidStateError')
        }
        await writer.write({ type: 'write', position, data })
        return data.length
      },
      async seal() {
        await writer?.close()
        writer = undefined
        snapshot = await handle.getFile()
      },
      async read(data, position) {
        if (!snapshot) {
          throw new DOMException('片段暂存尚未提交。', 'InvalidStateError')
        }
        const bytes = await snapshot
          .slice(position, position + data.length)
          .arrayBuffer()
        data.set(new Uint8Array(bytes))
        return bytes.byteLength
      },
      async close() {
        await writer?.abort()
        writer = undefined
        snapshot = undefined
      },
    }
  })
}
