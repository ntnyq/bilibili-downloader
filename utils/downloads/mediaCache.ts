import { z } from 'zod'

export const MEDIA_CACHE_DIRECTORY = 'media-cache-v1'
const MANIFEST_FILE = 'manifest.json'
const HASH_PATTERN = /^[\da-f]{64}$/u
const MAX_LEGACY_CHUNKS = 16384
const MAX_CHUNK_RUNS = 16384
const MAX_MANIFEST_BYTES = 1024 * 1024

/**
 * Each immutable file is bounded so appending never copies the entire download.
 */
export const MEDIA_CACHE_CHUNK_BYTES = 1024 * 1024

export interface CachedMediaState {
  resourceKey: string | null
  etag: string | null
  total: number | null
  received: number
  complete: boolean
  updatedAt: number
}

export interface MediaCache {
  read: (inputKey: string) => Promise<CachedMediaState | undefined>
  reset: (
    inputKey: string,
    representation: Pick<CachedMediaState, 'etag' | 'total' | 'resourceKey'>,
  ) => Promise<void>
  append: (inputKey: string, bytes: Uint8Array<ArrayBuffer>) => Promise<void>
  setTotal: (inputKey: string, total: number) => Promise<void>
  complete: (inputKey: string) => Promise<void>
  blob: (inputKey: string) => Promise<Blob>
  retain: (inputKeys: string[]) => Promise<void>
  clear: () => Promise<void>
}

export interface MediaCacheStats {
  bytes: number
  entries: number
}

export class MediaCacheError extends Error {
  override name = 'MediaCacheError'
}

/**
 * Weak validators cannot establish byte identity for Range concatenation.
 */
export function parseStrongETag(value: string | null): string | null {
  return value
    && value.length <= 512
    && /^"[\u{21}\u{23}-\u{7E}]*"$/u.test(value)
    ? value
    : null
}

const manifestFields = {
  resourceKey: z.string().regex(HASH_PATTERN).nullable(),
  etag: z
    .string()
    .refine(value => parseStrongETag(value) === value)
    .nullable(),
  total: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  received: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  complete: z.boolean(),
  updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}

const legacyManifestSchema = z
  .object({
    ...manifestFields,
    version: z.literal(1),
    chunks: z
      .array(z.number().int().positive().max(MEDIA_CACHE_CHUNK_BYTES))
      .max(MAX_LEGACY_CHUNKS),
  })
  .strict()

const manifestSchema = z
  .object({
    ...manifestFields,
    version: z.literal(2),
    chunks: z
      .array(
        z
          .object({
            size: z.number().int().positive().max(MEDIA_CACHE_CHUNK_BYTES),
            count: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          })
          .strict(),
      )
      .max(MAX_CHUNK_RUNS),
  })
  .strict()
  .refine(
    value =>
      value.received
        === value.chunks.reduce((sum, run) => sum + run.size * run.count, 0)
      && (value.total === null || value.received <= value.total)
      && (!value.complete
        || (value.received > 0 && value.total === value.received)),
  )

type CacheManifest = z.infer<typeof manifestSchema>

/**
 * Normal streaming produces one run of full chunks and a small tail. Bounding
 * interruption-driven fragmentation no longer puts a byte ceiling on a track.
 */
function appendChunk(
  runs: CacheManifest['chunks'],
  size: number,
): CacheManifest['chunks'] {
  const last = runs.at(-1)
  if (last?.size === size) {
    return [...runs.slice(0, -1), { size, count: last.count + 1 }]
  }
  if (runs.length >= MAX_CHUNK_RUNS) {
    throw new MediaCacheError('下载缓存碎片过多，请清理该任务缓存后重新下载。')
  }
  return [...runs, { size, count: 1 }]
}

function* manifestChunks(manifest: CacheManifest) {
  let index = 0
  for (const { size, count } of manifest.chunks) {
    for (let entry = 0; entry < count; entry++) {
      yield { index: index++, size }
    }
  }
}

function normalizeManifest(value: unknown): CacheManifest | undefined {
  const current = manifestSchema.safeParse(value)
  if (current.success) {
    return current.data
  }
  const legacy = legacyManifestSchema.safeParse(value)
  if (!legacy.success) {
    return
  }
  const chunks: CacheManifest['chunks'] = []
  for (const size of legacy.data.chunks) {
    const last = chunks.at(-1)
    if (last?.size === size) {
      last.count++
    } else {
      chunks.push({ size, count: 1 })
    }
  }
  const result = manifestSchema.safeParse({
    ...legacy.data,
    version: 2,
    chunks,
  })
  return result.success ? result.data : undefined
}

/**
 * Narrow filesystem boundary also allows deterministic crash/quota tests.
 */
export interface MediaCacheDirectory {
  getDirectoryHandle: (
    name: string,
    options?: FileSystemGetDirectoryOptions,
  ) => Promise<MediaCacheDirectory>
  getFileHandle: (
    name: string,
    options?: FileSystemGetFileOptions,
  ) => Promise<{
    getFile: () => Promise<File>
    createWritable: () => Promise<{
      write: (data: string | Uint8Array<ArrayBuffer>) => Promise<void>
      close: () => Promise<void>
      abort: () => Promise<void>
    }>
  }>
  removeEntry: (
    name: string,
    options?: FileSystemRemoveOptions,
  ) => Promise<void>
  keys: () => AsyncIterable<string>
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && error.name === 'NotFoundError'
}

function cacheError(error: unknown): MediaCacheError {
  if (error instanceof MediaCacheError) {
    return error
  }
  return new MediaCacheError(
    error instanceof Error && error.name === 'QuotaExceededError'
      ? '浏览器本地缓存空间不足，请清理下载缓存或释放磁盘空间后重试。'
      : '无法读写浏览器下载缓存，请清理缓存后重试。',
    { cause: error },
  )
}

async function getStorageRoot(): Promise<MediaCacheDirectory> {
  if (!globalThis.navigator?.storage?.getDirectory) {
    throw new MediaCacheError(
      '当前浏览器不支持本地下载缓存，请更新浏览器后重试。',
    )
  }
  return navigator.storage.getDirectory()
}

async function hashKey(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(hash), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function chunkFilename(index: number): string {
  return `chunk-${index.toString().padStart(6, '0')}`
}

async function removeEntry(directory: MediaCacheDirectory, name: string) {
  try {
    await directory.removeEntry(name, { recursive: true })
  } catch (error) {
    if (!isMissing(error)) {
      throw error
    }
  }
}

async function writeFile(
  directory: MediaCacheDirectory,
  name: string,
  data: string | Uint8Array<ArrayBuffer>,
) {
  const handle = await directory.getFileHandle(name, { create: true })
  const writer = await handle.createWritable()
  try {
    await writer.write(data)
    await writer.close()
  } catch (error) {
    // Abort is best effort: close() may already have closed the stream.
    await writer.abort().catch(() => {})
    throw error
  }
}

async function readManifest(
  directory: MediaCacheDirectory,
): Promise<CacheManifest | undefined> {
  try {
    const handle = await directory.getFileHandle(MANIFEST_FILE)
    const file = await handle.getFile()
    if (file.size > MAX_MANIFEST_BYTES) {
      return
    }
    let value: unknown
    try {
      value = JSON.parse(await file.text())
    } catch (error) {
      if (error instanceof SyntaxError) {
        return
      }
      throw error
    }
    const manifest = normalizeManifest(value)
    if (!manifest) {
      return
    }
    return manifest
  } catch (error) {
    if (isMissing(error)) {
      return
    }
    throw error
  }
}

/**
 * Validate media files when reusing a representation, never during UI polling.
 * Statistics report committed manifest bytes without reopening every chunk.
 */
async function hasValidChunks(
  directory: MediaCacheDirectory,
  manifest: CacheManifest,
): Promise<boolean> {
  try {
    for (const { index, size } of manifestChunks(manifest)) {
      const chunk = await directory.getFileHandle(chunkFilename(index))
      if ((await chunk.getFile()).size !== size) {
        return false
      }
    }
    return true
  } catch (error) {
    if (isMissing(error)) {
      return false
    }
    throw error
  }
}

function toState(manifest: CacheManifest): CachedMediaState {
  return {
    resourceKey: manifest.resourceKey,
    etag: manifest.etag,
    total: manifest.total,
    received: manifest.received,
    complete: manifest.complete,
    updatedAt: manifest.updatedAt,
  }
}

/**
 * The caller holds the global media-cache lock for this instance's lifetime.
 * Job and resource identities are hashed; request URLs are never persisted.
 */
export async function createMediaCache(
  jobId: string,
  storageRoot?: MediaCacheDirectory,
): Promise<MediaCache> {
  try {
    const storage = storageRoot ?? (await getStorageRoot())
    const root = await storage.getDirectoryHandle(MEDIA_CACHE_DIRECTORY, {
      create: true,
    })
    const jobKey = await hashKey(jobId)
    const job = await root.getDirectoryHandle(jobKey, { create: true })
    const entries = new Map<
      string,
      { directory: MediaCacheDirectory; manifest: CacheManifest }
    >()
    const load = async (inputKey: string) => {
      const existing = entries.get(inputKey)
      if (existing) {
        return existing
      }
      const name = await hashKey(inputKey)
      let directory: MediaCacheDirectory
      try {
        directory = await job.getDirectoryHandle(name)
      } catch (error) {
        if (isMissing(error)) {
          return
        }
        throw error
      }
      const manifest = await readManifest(directory)
      if (!manifest || !(await hasValidChunks(directory, manifest))) {
        await removeEntry(job, name)
        return
      }
      // A crash between writing a chunk and committing its manifest leaves an
      // unreferenced file. It must never become part of a subsequent download.
      const chunkCount = manifest.chunks.reduce(
        (sum, run) => sum + run.count,
        0,
      )
      for await (const filename of directory.keys()) {
        const index = Number(filename.slice('chunk-'.length))
        if (
          filename !== MANIFEST_FILE
          && (!Number.isSafeInteger(index)
            || !(index >= 0)
            || !(index < chunkCount)
            || filename !== chunkFilename(index))
        ) {
          await removeEntry(directory, filename)
        }
      }
      const entry = { directory, manifest }
      entries.set(inputKey, entry)
      return entry
    }
    const required = async (inputKey: string) => {
      const entry = await load(inputKey)
      if (!entry) {
        throw new MediaCacheError('下载缓存已丢失，请重新下载。')
      }
      return entry
    }
    const commit = async (
      entry: { directory: MediaCacheDirectory; manifest: CacheManifest },
      manifest: CacheManifest,
    ) => {
      await writeFile(entry.directory, MANIFEST_FILE, JSON.stringify(manifest))
      entry.manifest = manifest
    }
    const guarded = async <T>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action()
      } catch (error) {
        throw cacheError(error)
      }
    }
    return {
      read(inputKey) {
        return guarded(async () => {
          const entry = await load(inputKey)
          return entry ? toState(entry.manifest) : undefined
        })
      },
      reset(inputKey, representation) {
        return guarded(async () => {
          const manifest = manifestSchema.parse({
            version: 2,
            resourceKey: representation.resourceKey,
            etag: representation.etag,
            total: representation.total,
            received: 0,
            complete: false,
            updatedAt: Date.now(),
            chunks: [],
          })
          const name = await hashKey(inputKey)
          entries.delete(inputKey)
          await removeEntry(job, name)
          const directory = await job.getDirectoryHandle(name, { create: true })
          await writeFile(directory, MANIFEST_FILE, JSON.stringify(manifest))
          entries.set(inputKey, { directory, manifest })
        })
      },
      append(inputKey, bytes) {
        return guarded(async () => {
          if (!bytes.byteLength || bytes.byteLength > MEDIA_CACHE_CHUNK_BYTES) {
            throw new MediaCacheError('下载缓存块大小无效。')
          }
          const entry = await required(inputKey)
          const previous = entry.manifest
          const received = previous.received + bytes.byteLength
          if (
            !Number.isSafeInteger(received)
            || previous.complete
            || (previous.total !== null && received > previous.total)
          ) {
            throw new MediaCacheError('下载缓存大小与素材不一致。')
          }
          const chunks = appendChunk(previous.chunks, bytes.byteLength)
          const chunkCount = previous.chunks.reduce(
            (sum, run) => sum + run.count,
            0,
          )
          await writeFile(entry.directory, chunkFilename(chunkCount), bytes)
          await commit(entry, {
            ...previous,
            received,
            updatedAt: Date.now(),
            chunks,
          })
        })
      },
      complete(inputKey) {
        return guarded(async () => {
          const entry = await required(inputKey)
          const previous = entry.manifest
          if (
            !previous.received
            || (previous.total !== null && previous.total !== previous.received)
          ) {
            throw new MediaCacheError('素材缓存尚未完整下载。')
          }
          await commit(entry, {
            ...previous,
            complete: true,
            total: previous.received,
            updatedAt: Date.now(),
          })
        })
      },
      setTotal(inputKey, total) {
        return guarded(async () => {
          const entry = await required(inputKey)
          const previous = entry.manifest
          if (
            !Number.isSafeInteger(total)
            || total <= 0
            || total < previous.received
            || (previous.total !== null && previous.total !== total)
          ) {
            throw new MediaCacheError('下载缓存大小与素材不一致。')
          }
          await commit(entry, { ...previous, total, updatedAt: Date.now() })
        })
      },
      blob(inputKey) {
        return guarded(async () => {
          const { directory, manifest } = await required(inputKey)
          if (!manifest.complete) {
            throw new MediaCacheError('素材缓存尚未完整下载。')
          }
          const chunks: File[] = []
          for (const { index, size } of manifestChunks(manifest)) {
            const handle = await directory.getFileHandle(chunkFilename(index))
            const file = await handle.getFile()
            if (file.size !== size) {
              throw new MediaCacheError('素材缓存已损坏，请清理缓存后重试。')
            }
            chunks.push(file)
          }
          return new Blob(chunks, { type: 'application/octet-stream' })
        })
      },
      clear() {
        return guarded(async () => {
          entries.clear()
          await removeEntry(root, jobKey)
        })
      },
      retain(inputKeys) {
        return guarded(async () => {
          const retained = new Set(await Promise.all(inputKeys.map(hashKey)))
          for await (const name of job.keys()) {
            if (!retained.has(name)) {
              await removeEntry(job, name)
            }
          }
          for (const inputKey of entries.keys()) {
            if (!inputKeys.includes(inputKey)) {
              entries.delete(inputKey)
            }
          }
        })
      },
    }
  } catch (error) {
    throw cacheError(error)
  }
}

async function readCacheRoot(
  storageRoot?: MediaCacheDirectory,
): Promise<MediaCacheDirectory | undefined> {
  try {
    const storage = storageRoot ?? (await getStorageRoot())
    return await storage.getDirectoryHandle(MEDIA_CACHE_DIRECTORY)
  } catch (error) {
    if (isMissing(error)) {
      return
    }
    throw cacheError(error)
  }
}

export async function getMediaCacheStats(
  storageRoot?: MediaCacheDirectory,
): Promise<MediaCacheStats> {
  const stats: MediaCacheStats = { bytes: 0, entries: 0 }
  try {
    const root = await readCacheRoot(storageRoot)
    if (!root) {
      return stats
    }
    for await (const jobKey of root.keys()) {
      if (!HASH_PATTERN.test(jobKey)) {
        continue
      }
      try {
        const job = await root.getDirectoryHandle(jobKey)
        for await (const inputKey of job.keys()) {
          if (!HASH_PATTERN.test(inputKey)) {
            continue
          }
          try {
            const directory = await job.getDirectoryHandle(inputKey)
            const manifest = await readManifest(directory)
            if (manifest) {
              stats.bytes += manifest.received
              stats.entries++
            }
          } catch (error) {
            // Statistics may race a reset or cleanup while a job owns the lock.
            if (!isMissing(error)) {
              throw error
            }
          }
        }
      } catch (error) {
        if (!isMissing(error)) {
          throw error
        }
      }
    }
    return stats
  } catch (error) {
    if (isMissing(error)) {
      return stats
    }
    throw cacheError(error)
  }
}

/**
 * The caller holds the media-cache lock, including during cleanup and pruning.
 */
export async function clearMediaCache(
  jobId?: string,
  storageRoot?: MediaCacheDirectory,
) {
  try {
    const storage = storageRoot ?? (await getStorageRoot())
    if (jobId === undefined) {
      await removeEntry(storage, MEDIA_CACHE_DIRECTORY)
      return
    }
    const root = await readCacheRoot(storage)
    if (root) {
      await removeEntry(root, await hashKey(jobId))
    }
  } catch (error) {
    throw cacheError(error)
  }
}

export async function pruneMediaCache(
  retainedJobIds: string[],
  storageRoot?: MediaCacheDirectory,
) {
  try {
    const root = await readCacheRoot(storageRoot)
    if (!root) {
      return
    }
    const retained = new Set(await Promise.all(retainedJobIds.map(hashKey)))
    for await (const jobKey of root.keys()) {
      if (!retained.has(jobKey)) {
        await removeEntry(root, jobKey)
      }
    }
  } catch (error) {
    throw cacheError(error)
  }
}
