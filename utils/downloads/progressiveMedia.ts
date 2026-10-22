import { createFFmpegDiskFile } from './ffmpegDiskFile'
import type { DiskAccess, FFmpegFileSystem } from './ffmpegDiskFile'

interface FFmpegCore {
  FS: FFmpegFileSystem
  exec: (...args: string[]) => number
  setTimeout: (milliseconds: number) => void
  setLogger: (logger: (message: { message: string }) => void) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readProperty(value: unknown, name: string): unknown {
  return isRecord(value) ? value[name] : undefined
}

function isFFmpegCore(value: unknown): value is FFmpegCore {
  const fs = readProperty(value, 'FS')
  return (
    isRecord(value)
    && typeof readProperty(value, 'exec') === 'function'
    && typeof readProperty(value, 'setTimeout') === 'function'
    && typeof readProperty(value, 'setLogger') === 'function'
    && isRecord(fs)
    && ['create', 'mkdir', 'writeFile', 'mount', 'ErrnoError'].every(
      name => typeof fs[name] === 'function',
    )
    && readProperty(readProperty(fs, 'filesystems'), 'WORKERFS') !== undefined
  )
}

/**
 * Runs concat against mounted inputs; the only output node forwards to disk.
 */
export function runProgressiveFFmpeg(
  core: FFmpegCore,
  file: DiskAccess,
  inputCount: number,
  onProgress: (bytes: number) => void,
) {
  const logs: string[] = []
  core.setLogger(({ message }) => {
    logs.push(message.slice(0, 1000))
    if (logs.length > 12) {
      logs.shift()
    }
  })
  core.FS.writeFile(
    '/inputs.txt',
    Array.from(
      { length: inputCount },
      (_, index) => `file '/inputs/${index}.media'`,
    ).join('\n'),
  )
  file.truncate(0)
  const disk = createFFmpegDiskFile(core.FS, '/output.mp4', file, onProgress)
  // Synchronous remuxing can legitimately run for hours on slow storage. The
  // parent cancels by terminating this dedicated worker, not by elapsed time.
  core.setTimeout(-1)
  const exitCode = core.exec(
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    '/inputs.txt',
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-c',
    'copy',
    // Flush sample tables per fragment instead of retaining a full-file index
    // in the WASM heap. Keep negative/B-frame timestamps and track offsets.
    '-movflags',
    '+frag_keyframe+empty_moov+delay_moov+default_base_moof+negative_cts_offsets',
    '-frag_duration',
    '2000000',
    '/output.mp4',
  )
  const error = disk.getError()
  if (error) {
    throw error
  }
  if (exitCode !== 0 || !file.getSize()) {
    throw new Error(
      `旧格式视频封装失败，请检查素材是否完整。${logs.slice(-3).join(' ')}`,
    )
  }
}

interface SyncFileHandle extends FileSystemFileHandle {
  createSyncAccessHandle: () => Promise<
    DiskAccess & { flush: () => void; close: () => void }
  >
}

function isSyncFileHandle(
  handle: FileSystemFileHandle,
): handle is SyncFileHandle {
  return (
    'createSyncAccessHandle' in handle
    && typeof handle.createSyncAccessHandle === 'function'
  )
}

/**
 * Validates the untyped boundary to the locally bundled single-thread core.
 * wasmBinary is used by integration tests; browser calls supply a local wasmURL.
 */
export async function loadFFmpegCore(
  coreURL: string,
  options: { wasmURL?: string; wasmBinary?: Uint8Array<ArrayBuffer> },
) {
  const module: unknown = await import(/* @vite-ignore */ coreURL)
  const createCore = readProperty(module, 'default')
  if (typeof createCore !== 'function') {
    throw new TypeError('无法加载浏览器内 FFmpeg。')
  }
  const core: unknown = await createCore({
    wasmBinary: options.wasmBinary,
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL: options.wasmURL }))}`,
  })
  if (!isFFmpegCore(core)) {
    throw new Error('浏览器内 FFmpeg 文件接口不兼容，请更新扩展。')
  }
  return core
}

/**
 * FFmpeg handles legacy containers and concat timing, but all media I/O is disk
 * backed. Only the small concat manifest and codec/index state live in MEMFS.
 */
export async function mergeProgressiveMedia(
  inputs: Blob[],
  handle: FileSystemFileHandle,
  onProgress: (bytes: number) => void,
) {
  if (!inputs.length) {
    throw new Error('音视频素材数量无效。')
  }
  if (!isSyncFileHandle(handle)) {
    throw new Error(
      '当前浏览器不支持磁盘封装所需的同步文件接口，请更新浏览器。',
    )
  }
  const core = await loadFFmpegCore(
    new URL('/ffmpeg/ffmpeg-core.js', self.location.href).href,
    { wasmURL: new URL('/ffmpeg/ffmpeg-core.wasm', self.location.href).href },
  )
  core.FS.mkdir('/inputs')
  core.FS.mount(
    core.FS.filesystems.WORKERFS,
    {
      blobs: inputs.map((data, index) => ({
        name: `${index}.media`,
        data,
      })),
    },
    '/inputs',
  )
  const file = await handle.createSyncAccessHandle()
  try {
    runProgressiveFFmpeg(core, file, inputs.length, onProgress)
    file.flush()
  } finally {
    file.close()
  }
}
