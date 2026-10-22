/**
 * The small Emscripten boundary used by the bundled FFmpeg core (0.12.x).
 */
export interface FFmpegFileNode {
  mode: number
  timestamp: number
  node_ops: {
    getattr: (node: FFmpegFileNode) => Record<string, unknown> & {
      size: number
      blocks: number
    }
    setattr: (
      node: FFmpegFileNode,
      attributes: { mode?: number; timestamp?: number; size?: number },
    ) => void
  }
  stream_ops: {
    read: (
      stream: FFmpegFileStream,
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number,
    ) => number
    write: (
      stream: FFmpegFileStream,
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number,
    ) => number
    llseek: (stream: FFmpegFileStream, offset: number, whence: number) => number
    allocate: (stream: FFmpegFileStream, offset: number, length: number) => void
  }
}

export interface FFmpegFileStream {
  position: number
}

export interface FFmpegFileSystem {
  create: (path: string) => FFmpegFileNode
  mkdir: (path: string) => unknown
  writeFile: (path: string, data: string | Uint8Array<ArrayBuffer>) => unknown
  mount: (filesystem: unknown, options: unknown, path: string) => unknown
  filesystems: { WORKERFS: unknown }
  ErrnoError: new (errno: number) => Error
}

/**
 * Worker-only OPFS methods, kept local to avoid adding WebWorker globals to DOM.
 */
export interface DiskAccess {
  read: (buffer: Uint8Array, options: { at: number }) => number
  write: (buffer: Uint8Array, options: { at: number }) => number
  getSize: () => number
  truncate: (size: number) => void
}

/**
 * Redirects one regular file's operations to OPFS. Do not inherit MEMFS's write,
 * truncate, allocate or mmap methods: those can allocate the entire media file.
 * Buffers passed here are small views of FFmpeg's existing WASM heap.
 */
export function createFFmpegDiskFile(
  fs: FFmpegFileSystem,
  path: string,
  file: DiskAccess,
  onProgress: (bytes: number) => void,
) {
  const node = fs.create(path)
  const getattr = node.node_ops.getattr
  let failure: unknown
  const guarded = <T>(operation: () => T): T => {
    try {
      return operation()
    } catch (error) {
      failure ??= error
      throw new fs.ErrnoError(
        error instanceof Error && error.name === 'QuotaExceededError' ? 51 : 29,
      )
    }
  }
  node.node_ops = {
    getattr(node) {
      return guarded(() => {
        const size = file.getSize()
        return {
          ...getattr(node),
          size,
          blocks: Math.ceil(size / 4096),
        }
      })
    },
    setattr(node, attributes) {
      guarded(() => {
        if (attributes.mode !== undefined) {
          node.mode = attributes.mode
        }
        if (attributes.timestamp !== undefined) {
          node.timestamp = attributes.timestamp
        }
        if (attributes.size !== undefined) {
          file.truncate(attributes.size)
        }
      })
    },
  }
  node.stream_ops = {
    read(_stream, buffer, offset, length, position) {
      return guarded(() =>
        file.read(buffer.subarray(offset, offset + length), { at: position }),
      )
    },
    write(_stream, buffer, offset, length, position) {
      return guarded(() => {
        let written = 0
        while (written < length) {
          const count = file.write(
            buffer.subarray(offset + written, offset + length),
            { at: position + written },
          )
          if (count <= 0 || count > length - written) {
            throw new Error('浏览器磁盘写入未完成。')
          }
          written += count
        }
        onProgress(file.getSize())
        return written
      })
    },
    llseek(stream, offset, whence) {
      const position =
        offset
        + (whence === 1 ? stream.position : whence === 2 ? file.getSize() : 0)
      if (
        ![0, 1, 2].includes(whence)
        || !Number.isSafeInteger(position)
        || position < 0
      ) {
        throw new fs.ErrnoError(28)
      }
      return position
    },
    allocate(_stream, offset, length) {
      guarded(() => {
        const size = offset + length
        if (size > file.getSize()) {
          file.truncate(size)
        }
      })
    },
  }
  return {
    getError: () => failure,
  }
}
