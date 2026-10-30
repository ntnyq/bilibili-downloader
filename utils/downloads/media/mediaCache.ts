import { z } from 'zod'
import { i18n } from '~/utils/i18n'

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
 *
 * @param value - Raw ETag header value, or null if the header is absent.
 * @returns The original strong ASCII quoted validator if it is at most 512
 * characters, otherwise null.
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
 *
 * @param runs - Existing run-length encoded chunk descriptors, which are not
 * mutated.
 * @param size - Byte length of the new validated immutable cache chunk.
 * @returns A new run list with the last matching run extended or a new run
 * appended.
 * @throws {MediaCacheError} If adding a distinct run would exceed
 *   MAX_CHUNK_RUNS.
 */
function appendChunkRun(
  runs: CacheManifest['chunks'],
  size: number,
): CacheManifest['chunks'] {
  const last = runs.at(-1)
  if (last?.size === size) {
    return [...runs.slice(0, -1), { size, count: last.count + 1 }]
  }
  if (runs.length >= MAX_CHUNK_RUNS) {
    throw new MediaCacheError(
      i18n.t('mediaCache.tooManyDownloadCacheFragmentsClearThisTask'),
    )
  }
  return [...runs, { size, count: 1 }]
}

/**
 * Expands run-length encoded manifest chunks without allocating a full chunk
 * list.
 *
 * @param manifest - Validated cache manifest whose chunk runs describe
 * committed files.
 * @returns A lazy iterator over sequential chunk descriptors.
 * @yields A zero-based chunk index and expected byte size for each committed
 *   chunk.
 */
function* iterateManifestChunks(manifest: CacheManifest) {
  let index = 0
  for (const { size, count } of manifest.chunks) {
    for (let entry = 0; entry < count; entry++) {
      yield { index: index++, size }
    }
  }
}

/**
 * Validates a current manifest or migrates legacy per-chunk lengths into chunk
 * runs.
 *
 * @param value - Untrusted JSON value read from a cache manifest.
 * @returns A validated version-two manifest, or undefined if neither the
 * current nor migrated legacy form is valid.
 */
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

/**
 * Recognizes a missing OPFS entry without treating other filesystem failures
 * as absence.
 *
 * @param error - Unknown filesystem exception or rejection reason.
 * @returns Whether the value is an Error whose name is NotFoundError.
 */
function isMissingEntryError(error: unknown): boolean {
  return error instanceof Error && error.name === 'NotFoundError'
}

/**
 * Maps filesystem/cache failures to a user-facing error while preserving their
 * cause.
 *
 * @param error - Unknown cache failure, including an existing MediaCacheError
 * or quota error.
 * @returns The existing MediaCacheError, or a new quota-specific/generic cache
 * error wrapping the cause.
 */
function toMediaCacheError(error: unknown): MediaCacheError {
  if (error instanceof MediaCacheError) {
    return error
  }
  return new MediaCacheError(
    error instanceof Error && error.name === 'QuotaExceededError'
      ? i18n.t('mediaCache.insufficientBrowserCacheSpaceClearTheDownloadCache')
      : i18n.t('mediaCache.cannotReadOrWriteTheBrowserDownloadCache'),
    { cause: error },
  )
}

/**
 * Obtains the OPFS root used by the browser media cache.
 *
 * @returns A promise resolving to the storage root through the narrow
 * cache-directory interface.
 * @throws {MediaCacheError} If the browser does not expose OPFS directory
 *   access.
 * @throws The storage API rejection if the root cannot be opened.
 */
async function getStorageRoot(): Promise<MediaCacheDirectory> {
  if (!globalThis.navigator?.storage?.getDirectory) {
    throw new MediaCacheError(
      i18n.t('mediaCache.thisBrowserDoesNotSupportLocalDownloadCaching'),
    )
  }
  return navigator.storage.getDirectory()
}

/**
 * Hashes a job or input identity so raw IDs and request details are not used
 * as directory names.
 *
 * @param value - Stable job or media-input identity to hash.
 * @returns A promise resolving to its 64-character lowercase hexadecimal
 * SHA-256 digest.
 * @throws The Web Crypto error if hashing fails.
 */
async function hashCacheKey(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(hash), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/**
 * Formats the deterministic filename for one committed cache chunk.
 *
 * @param index - Nonnegative zero-based chunk index from a validated manifest.
 * @returns A chunk- name with the decimal index padded to at least six digits.
 */
function getChunkFilename(index: number): string {
  return `chunk-${index.toString().padStart(6, '0')}`
}

/**
 * Removes a cache file or directory recursively, tolerating an already missing
 * entry.
 *
 * @param directory - Parent directory owning the entry.
 * @param name - Immediate child entry name to remove.
 * @returns A promise resolving without a value after removal or a
 * NotFoundError.
 * @throws The filesystem rejection for failures other than a missing entry.
 */
async function removeEntry(directory: MediaCacheDirectory, name: string) {
  try {
    await directory.removeEntry(name, { recursive: true })
  } catch (error) {
    if (!isMissingEntryError(error)) {
      throw error
    }
  }
}

/**
 * Writes and commits one cache file, aborting the writable stream on failure.
 *
 * @param directory - Directory receiving the file.
 * @param name - Immediate filename, created if absent.
 * @param data - Manifest text or bounded immutable chunk bytes to write.
 * @returns A promise resolving without a value after the writable stream
 * closes successfully.
 * @throws The original file-open, write, or close rejection; cleanup failures
 *   do not replace it.
 */
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

/**
 * Reads a size-bounded cache manifest and validates or migrates its JSON
 * payload.
 *
 * @param directory - Media-input cache directory containing MANIFEST_FILE.
 * @returns A promise resolving to a normalized manifest, or undefined for
 * absent, oversized, invalid-JSON, or schema-invalid manifests.
 * @throws The filesystem rejection for failures other than a missing entry;
 *   JSON syntax errors are treated as corruption.
 */
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
    if (isMissingEntryError(error)) {
      return
    }
    throw error
  }
}

/**
 * Validate media files when reusing a representation, never during UI polling.
 * Statistics report committed manifest bytes without reopening every chunk.
 *
 * @param directory - Media-input directory containing committed chunk files.
 * @param manifest - Validated manifest listing expected chunk count and sizes.
 * @returns A promise resolving to true only when every referenced file exists
 * with exactly its expected length.
 * @throws The filesystem rejection for failures other than missing chunks,
 *   which return false.
 */
async function hasValidChunks(
  directory: MediaCacheDirectory,
  manifest: CacheManifest,
): Promise<boolean> {
  try {
    for (const { index, size } of iterateManifestChunks(manifest)) {
      const chunk = await directory.getFileHandle(getChunkFilename(index))
      if ((await chunk.getFile()).size !== size) {
        return false
      }
    }
    return true
  } catch (error) {
    if (isMissingEntryError(error)) {
      return false
    }
    throw error
  }
}

/**
 * Projects validated manifest metadata into the public resumable-transfer
 * state.
 *
 * @param manifest - Validated manifest with committed transfer and
 * representation metadata.
 * @returns A state snapshot excluding version and internal chunk-run
 * descriptors.
 */
function toCachedMediaState(manifest: CacheManifest): CachedMediaState {
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
 *
 * @param jobId - Stable queue job ID used to isolate this job cached inputs.
 * @param storageRoot - Optional storage adapter for deterministic tests;
 * defaults to the browser OPFS root.
 * @returns A promise resolving to a job-scoped cache with validated
 * read/write, completion, Blob, retention, and clearing operations.
 * @throws {MediaCacheError} If OPFS is unsupported, job directories cannot be
 *   created, or an underlying cache operation fails.
 * @remarks Returned methods also reject malformed chunks, inconsistent
 *   lengths, incomplete/corrupt media, and quota failures with
 *   MediaCacheError. All operations require the caller media-cache lock,
 *   including cleanup.
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
    const jobKey = await hashCacheKey(jobId)
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
      const name = await hashCacheKey(inputKey)
      let directory: MediaCacheDirectory
      try {
        directory = await job.getDirectoryHandle(name)
      } catch (error) {
        if (isMissingEntryError(error)) {
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
            || filename !== getChunkFilename(index))
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
        throw new MediaCacheError(
          i18n.t('fetchCachedMedia.downloadCacheWasLostDownloadAgain'),
        )
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
        throw toMediaCacheError(error)
      }
    }
    return {
      read(inputKey) {
        return guarded(async () => {
          const entry = await load(inputKey)
          return entry ? toCachedMediaState(entry.manifest) : undefined
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
          const name = await hashCacheKey(inputKey)
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
            throw new MediaCacheError(
              i18n.t('mediaCache.invalidDownloadCacheBlockSize'),
            )
          }
          const entry = await required(inputKey)
          const previous = entry.manifest
          const received = previous.received + bytes.byteLength
          if (
            !Number.isSafeInteger(received)
            || previous.complete
            || (previous.total !== null && received > previous.total)
          ) {
            throw new MediaCacheError(
              i18n.t('mediaCache.downloadCacheSizeDoesNotMatchTheAsset'),
            )
          }
          const chunks = appendChunkRun(previous.chunks, bytes.byteLength)
          const chunkCount = previous.chunks.reduce(
            (sum, run) => sum + run.count,
            0,
          )
          await writeFile(entry.directory, getChunkFilename(chunkCount), bytes)
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
            throw new MediaCacheError(
              i18n.t('mediaCache.theAssetCacheIsNotFullyDownloaded'),
            )
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
            throw new MediaCacheError(
              i18n.t('mediaCache.downloadCacheSizeDoesNotMatchTheAsset'),
            )
          }
          await commit(entry, { ...previous, total, updatedAt: Date.now() })
        })
      },
      blob(inputKey) {
        return guarded(async () => {
          const { directory, manifest } = await required(inputKey)
          if (!manifest.complete) {
            throw new MediaCacheError(
              i18n.t('mediaCache.theAssetCacheIsNotFullyDownloaded'),
            )
          }
          const chunks: File[] = []
          for (const { index, size } of iterateManifestChunks(manifest)) {
            const handle = await directory.getFileHandle(
              getChunkFilename(index),
            )
            const file = await handle.getFile()
            if (file.size !== size) {
              throw new MediaCacheError(
                i18n.t('mediaCache.theAssetCacheIsCorruptClearItAnd'),
              )
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
          const retained = new Set(
            await Promise.all(inputKeys.map(hashCacheKey)),
          )
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
    throw toMediaCacheError(error)
  }
}

/**
 * Opens an existing cache root without creating it.
 *
 * @param storageRoot - Optional storage adapter; defaults to the browser OPFS
 * root.
 * @returns A promise resolving to the media-cache directory, or undefined when
 * it does not exist.
 * @throws {MediaCacheError} If storage is unsupported or opening the root
 *   fails for a reason other than absence.
 */
async function readCacheRoot(
  storageRoot?: MediaCacheDirectory,
): Promise<MediaCacheDirectory | undefined> {
  try {
    const storage = storageRoot ?? (await getStorageRoot())
    return await storage.getDirectoryHandle(MEDIA_CACHE_DIRECTORY)
  } catch (error) {
    if (isMissingEntryError(error)) {
      return
    }
    throw toMediaCacheError(error)
  }
}

/**
 * Totals committed media bytes and input entries without reopening every
 * cached chunk.
 *
 * @param storageRoot - Optional storage adapter; defaults to the browser OPFS
 * root.
 * @returns A promise resolving to byte and entry counts; absent or
 * concurrently removed entries are tolerated.
 * @throws {MediaCacheError} If scanning storage fails for a reason other than
 *   missing entries.
 */
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
            if (!isMissingEntryError(error)) {
              throw error
            }
          }
        }
      } catch (error) {
        if (!isMissingEntryError(error)) {
          throw error
        }
      }
    }
    return stats
  } catch (error) {
    if (isMissingEntryError(error)) {
      return stats
    }
    throw toMediaCacheError(error)
  }
}

/**
 * The caller holds the media-cache lock, including during cleanup and pruning.
 *
 * @param jobId - Optional job ID; omission clears the entire media-cache
 * directory.
 * @param storageRoot - Optional storage adapter; defaults to the browser OPFS
 * root.
 * @returns A promise resolving without a value after removal; already missing
 * entries are accepted.
 * @throws {MediaCacheError} If storage access or removal fails for a reason
 *   other than absence.
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
      await removeEntry(root, await hashCacheKey(jobId))
    }
  } catch (error) {
    throw toMediaCacheError(error)
  }
}

/**
 * Removes cache directories that do not belong to retained jobs, including
 * orphaned outputs.
 *
 * @param retainedJobIds - Queue job IDs whose hashed cache directories must
 * survive pruning.
 * @param storageRoot - Optional storage adapter; defaults to the browser OPFS
 * root.
 * @returns A promise resolving without a value after stale entries are
 * removed; a missing cache root is accepted.
 * @throws {MediaCacheError} If hashing, scanning, or removal fails.
 * @remarks The caller must hold the media-cache lock throughout pruning.
 */
export async function pruneMediaCache(
  retainedJobIds: string[],
  storageRoot?: MediaCacheDirectory,
) {
  try {
    const root = await readCacheRoot(storageRoot)
    if (!root) {
      return
    }
    const retained = new Set(
      await Promise.all(retainedJobIds.map(hashCacheKey)),
    )
    for await (const jobKey of root.keys()) {
      if (!retained.has(jobKey)) {
        await removeEntry(root, jobKey)
      }
    }
  } catch (error) {
    throw toMediaCacheError(error)
  }
}
