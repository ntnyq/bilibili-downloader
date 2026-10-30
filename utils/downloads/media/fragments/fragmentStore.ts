import { i18n } from '~/utils/i18n'

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
 * Reading seals that track; reset/disposal discard pending bytes and close
 * files. Each open must truncate the logical file, including after a reset.
 *
 * @param open - Async track-file opener; each open must truncate that track
 * logical file, including after reset.
 * @returns A serialized per-track store with append/read, reset, and
 * idempotent disposal; reads seal buffered writes first.
 * @remarks Files open lazily. Operations reject invalid tracks/ranges with
 *   RangeError, sealed appends or use after disposal with InvalidStateError,
 *   incomplete I/O, and opener/file failures. A failed operation poisons later
 *   queued work; disposal still closes every file.
 */
export function createDiskFragmentStore(
  open: (trackId: number) => Promise<FragmentStoreFile>,
) {
  const tracks = new Map<number, TrackFile>()
  let queue = Promise.resolve()
  let failure: { error: unknown } | undefined
  let disposed = false
  let disposal: Promise<void> | undefined

  function enqueueOperation<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    if (disposed) {
      return Promise.reject(
        new DOMException(
          i18n.t('fragmentStore.fragmentStorageIsClosed'),
          'InvalidStateError',
        ),
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
      throw new RangeError(i18n.t('fragmentStore.invalidFragmentTrackId'))
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

  async function flushTrack(track: TrackFile) {
    let offset = 0
    while (offset < track.used) {
      const data = track.buffer.subarray(offset, track.used)
      const written = await track.file.write(data, track.written)
      if (!Number.isInteger(written) || written <= 0 || written > data.length) {
        throw new Error(
          i18n.t('fragmentStore.fragmentStorageFileWriteMadeNoProgress'),
        )
      }
      offset += written
      track.written += written
    }
    track.used = 0
  }

  return {
    append(trackId: number, data: Uint8Array) {
      return enqueueOperation(async () => {
        const track = await getTrack(trackId)
        if (track.sealed) {
          throw new DOMException(
            i18n.t('fragmentStore.fragmentStorageHasEnteredTheReadPhase'),
            'InvalidStateError',
          )
        }
        if (!Number.isSafeInteger(track.written + track.used + data.length)) {
          throw new RangeError(
            i18n.t('fragmentStore.fragmentStorageFileIsTooLarge'),
          )
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
            await flushTrack(track)
          }
        }
      })
    },
    read(trackId: number, offset: number, length: number) {
      return enqueueOperation(async () => {
        if (
          !Number.isSafeInteger(offset)
          || offset < 0
          || !Number.isInteger(length)
          || length < 0
          || length > FRAGMENT_PAGE_SIZE
        ) {
          throw new RangeError(
            i18n.t('fragmentStore.invalidFragmentStorageReadRange'),
          )
        }
        const track = await getTrack(trackId)
        if (offset + length > track.written + track.used) {
          throw new RangeError(
            i18n.t('fragmentStore.fragmentStorageFileIsIncomplete'),
          )
        }
        if (!track.sealed) {
          await flushTrack(track)
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
            throw new RangeError(
              i18n.t('fragmentStore.fragmentStorageFileReadIncomplete'),
            )
          }
          consumed += count
        }
        return data
      })
    },
    reset(trackId: number) {
      return enqueueOperation(async () => {
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
 *
 * @param directory - Caller-owned temporary directory used for the backing
 * track files.
 * @param filename - Maps each track ID to its temporary filename within
 * directory.
 * @returns A lazy disk store using OPFS writable streams, with committed File
 * snapshots for bounded reads.
 * @remarks Reading commits that track writable stream. Reset/dispose abort
 *   pending writes and release snapshots; the caller removes the directory.
 *   Operations propagate OPFS errors and the validation failures of
 *   createDiskFragmentStore().
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
          throw new DOMException(
            i18n.t('fragmentStore.fragmentStorageWriteStreamIsClosed'),
            'InvalidStateError',
          )
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
          throw new DOMException(
            i18n.t('fragmentStore.fragmentStorageHasNotBeenCommitted'),
            'InvalidStateError',
          )
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
