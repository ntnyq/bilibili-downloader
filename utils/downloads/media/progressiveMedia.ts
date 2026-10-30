import { i18n } from '~/utils/i18n'
import { createFFmpegDiskFile } from './ffmpegDiskFile'
import type { DiskAccess, FFmpegFileSystem } from './ffmpegDiskFile'

interface FFmpegCore {
  FS: FFmpegFileSystem
  exec: (...args: string[]) => number
  setTimeout: (milliseconds: number) => void
  setLogger: (logger: (message: { message: string }) => void) => void
}

/**
 * Checks for a non-null object at the untyped FFmpeg module boundary.
 *
 * @param value - Unknown module, core, or filesystem value to inspect.
 * @returns Whether the value can be treated as an object with string-keyed
 * properties.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Reads one property from an unknown object without assuming a module shape.
 *
 * @param value - Unknown object-like value to inspect.
 * @param name - Property name to read.
 * @returns The property value, or undefined if value is not a non-null object.
 */
function readProperty(value: unknown, name: string): unknown {
  return isRecord(value) ? value[name] : undefined
}

/**
 * Checks the minimal core and filesystem capabilities required for disk-backed
 * FFmpeg remuxing.
 *
 * @param value - Unknown result returned by the dynamically loaded FFmpeg core
 * factory.
 * @returns Whether the value exposes the required core methods, filesystem
 * methods, and WORKERFS support.
 */
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
 *
 * Returns no value after synchronous fragmented-MP4 remuxing succeeds with
 * nonempty output.
 *
 * @param core - Validated FFmpeg core with input files already mounted under
 * /inputs.
 * @param file - Caller-owned output disk adapter, truncated before execution.
 * @param inputCount - Number of ordered mounted inputs named index.media for
 * the concat manifest.
 * @param onProgress - Callback receiving output file size after disk writes.
 * @throws {Error} If FFmpeg returns a nonzero status or produces no bytes.
 * @throws The original captured disk/progress error, or filesystem/core
 *   exception, if execution fails.
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
      i18n.t('progressiveMedia.legacyVideoRemuxingFailedCheckThatTheAssets', [
        logs.slice(-3).join(' '),
      ]),
    )
  }
}

interface SyncFileHandle extends FileSystemFileHandle {
  createSyncAccessHandle: () => Promise<
    DiskAccess & { flush: () => void; close: () => void }
  >
}

/**
 * Checks for the Worker-only synchronous OPFS access required by the FFmpeg
 * output adapter.
 *
 * @param handle - Output file handle to narrow before opening a synchronous
 * disk stream.
 * @returns Whether createSyncAccessHandle is callable, narrowing the handle to
 * SyncFileHandle.
 */
function isSyncAccessFileHandle(
  handle: FileSystemFileHandle,
): handle is SyncFileHandle {
  return (
    'createSyncAccessHandle' in handle
    && typeof handle.createSyncAccessHandle === 'function'
  )
}

/**
 * Validates the untyped boundary to the locally bundled single-thread core.
 * wasmBinary is used by integration tests; browser calls supply a local
 * wasmURL.
 *
 * @param coreURL - URL of the bundled single-thread FFmpeg JavaScript module.
 * @param options - WASM location or bytes supplied to the FFmpeg core factory.
 * @param options.wasmURL - Optional local WASM URL used by browser Worker
 * calls.
 * @param options.wasmBinary - Optional preloaded WASM bytes used by
 * integration tests.
 * @returns A promise resolving to a core exposing the validated execution and
 * filesystem interface.
 * @throws {TypeError} If the loaded module has no callable default factory.
 * @throws {Error} If the initialized core lacks required filesystem or
 *   execution capabilities.
 * @throws The module-import or core-initialization rejection if loading fails.
 */
export async function loadFFmpegCore(
  coreURL: string,
  options: { wasmURL?: string; wasmBinary?: Uint8Array<ArrayBuffer> },
) {
  const module: unknown = await import(/* @vite-ignore */ coreURL)
  const createCore = readProperty(module, 'default')
  if (typeof createCore !== 'function') {
    throw new TypeError(i18n.t('progressiveMedia.cannotLoadBrowserFfmpeg'))
  }
  const core: unknown = await createCore({
    wasmBinary: options.wasmBinary,
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL: options.wasmURL }))}`,
  })
  if (!isFFmpegCore(core)) {
    throw new Error(
      i18n.t(
        'progressiveMedia.theBrowserFfmpegFileInterfaceIsIncompatibleUpdate',
      ),
    )
  }
  return core
}

/**
 * FFmpeg handles legacy containers and concat timing, but all media I/O is
 * disk backed. Only the small concat manifest and codec/index state live in
 * MEMFS.
 *
 * @param inputs - Ordered progressive FLV/MP4 input fragments mounted
 * read-only through WORKERFS.
 * @param handle - OPFS output handle supporting synchronous Worker access.
 * @param onProgress - Callback receiving output size while FFmpeg writes the
 * MP4.
 * @returns A promise resolving without a value after a nonempty output is
 * written, flushed, and its disk handle is closed.
 * @throws {Error} If inputs are empty, synchronous access is unavailable, or
 *   FFmpeg produces invalid output.
 * @throws The core-loading, filesystem, disk, or progress-callback failure if
 *   remuxing cannot complete.
 */
export async function mergeProgressiveMedia(
  inputs: Blob[],
  handle: FileSystemFileHandle,
  onProgress: (bytes: number) => void,
) {
  if (!inputs.length) {
    throw new Error(i18n.t('progressiveMedia.invalidNumberOfMediaAssets'))
  }
  if (!isSyncAccessFileHandle(handle)) {
    throw new Error(
      i18n.t(
        'progressiveMedia.thisBrowserLacksTheSynchronousFileInterfaceNeeded',
      ),
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
