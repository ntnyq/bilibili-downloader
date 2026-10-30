import {
  downloadHistoryRecordSchema,
  downloadLibrarySchema,
  MAX_LIBRARY_BYTES,
  MAX_LIBRARY_RECORDS,
} from '~/types/downloadHistory'
import { MAX_PENDING_JOBS } from '../constants'
import { DOWNLOAD_KIND_LABELS } from '../labels'
import { getJobIdentity } from '../queue/identity'
import { isJobActive } from '../queue/jobs'
import type { DownloadJob, DownloadKind } from '~/types/download'
import type {
  DownloadHistoryRecord,
  DownloadLibrary,
} from '~/types/downloadHistory'

const encoder = new TextEncoder()

/**
 * Converts a completed job to a bounded, validated long-term history record.
 *
 * @param job - Completed job whose identity, settings, and user-visible
 * metadata will be archived.
 * @param completedAt - Optional known completion time in milliseconds; omitted
 * for migrated legacy jobs.
 * @returns A schema-validated history snapshot with truncated display fields
 * and no transient runner state.
 * @throws {import('zod').ZodError} If the bounded snapshot is not a valid
 *   history record.
 */
function createHistoryRecord(
  job: DownloadJob,
  completedAt?: number,
): DownloadHistoryRecord {
  return downloadHistoryRecordSchema.parse({
    ...job,
    id: job.id.slice(0, 128),
    identity: getJobIdentity(job),
    title: job.title.slice(0, 1000),
    owner: job.owner.slice(0, 200),
    part: job.part.slice(0, 1000),
    cover: job.cover.length <= 2048 ? job.cover : '',
    filename: job.filename?.slice(0, 1024),
    quality: job.quality?.slice(0, 200),
    completedAt,
  })
}

/**
 * Keep the newest completion per identity, evicting oldest records at either
 * bound.
 *
 * @param records - Candidate history records, potentially containing duplicate
 * asset identities.
 * @param evictedCount - Previously accumulated eviction count; defaults to
 * zero.
 * @returns A versioned library containing the newest unique records within
 * count/byte limits and a saturating eviction counter.
 * @throws {Error} If the newest unique record alone exceeds the library byte
 *   budget.
 */
export function pruneDownloadLibrary(
  records: DownloadHistoryRecord[],
  evictedCount = 0,
): DownloadLibrary {
  const unique = new Map<string, DownloadHistoryRecord>()
  const ordered = [...records].sort(
    (left, right) =>
      (right.completedAt ?? right.createdAt)
      - (left.completedAt ?? left.createdAt),
  )
  for (const record of ordered) {
    if (!unique.has(record.identity)) {
      unique.set(record.identity, record)
    }
  }
  const retained: DownloadHistoryRecord[] = []
  // Reserve the maximum possible counter width so eviction accounting stays bounded.
  let bytes = encoder.encode(
    JSON.stringify({
      version: 1,
      records: [],
      evictedCount: Number.MAX_SAFE_INTEGER,
    }),
  ).byteLength
  for (const record of unique.values()) {
    const recordBytes = encoder.encode(JSON.stringify(record)).byteLength
    if (recordBytes + bytes > MAX_LIBRARY_BYTES && !retained.length) {
      throw new Error('单条下载记录超出长期记录存储上限。')
    }
    const separatorBytes = retained.length ? 1 : 0
    if (
      retained.length === MAX_LIBRARY_RECORDS
      || bytes + recordBytes + separatorBytes > MAX_LIBRARY_BYTES
    ) {
      break
    }
    retained.push(record)
    bytes += recordBytes + separatorBytes
  }
  return {
    version: 1,
    records: retained,
    evictedCount: Math.min(
      Number.MAX_SAFE_INTEGER,
      evictedCount + unique.size - retained.length,
    ),
  }
}

/**
 * Catalog presence marks migration as complete, including an intentionally
 * empty one. Imported jobs have no invented completion time because old queues
 * did not track it.
 *
 * @param stored - Persisted library payload; undefined means migration from
 * the queue has not happened.
 * @param jobs - Queue snapshot whose completed jobs are migrated only when
 * stored is undefined.
 * @returns A validated, pruned existing library or a migrated library
 * preserving unknown legacy completion times.
 * @throws {Error} If persisted records are malformed, contain inconsistent
 *   identities, or exceed the per-record storage budget.
 * @throws {import('zod').ZodError} If a migrated completed job cannot form a
 *   valid history record.
 */
export function initializeDownloadLibrary(
  stored: unknown,
  jobs: DownloadJob[],
): DownloadLibrary {
  if (stored !== undefined) {
    const result = downloadLibrarySchema.safeParse(stored)
    if (
      !result.success
      || result.data.records.some(
        record => record.identity !== getJobIdentity(record),
      )
    ) {
      throw new Error(
        '长期下载记录格式损坏，无法读取。可清空长期记录后重新建立。',
      )
    }
    return pruneDownloadLibrary(result.data.records, result.data.evictedCount)
  }
  return pruneDownloadLibrary(
    jobs
      .filter(job => job.status === 'completed')
      .map(job => createHistoryRecord(job)),
  )
}

/**
 * Archive transitions only, so removed history never reappears on unrelated
 * queue writes.
 *
 * @param library - Current long-term library, including any user removals and
 * accumulated evictions.
 * @param previousJobs - Queue snapshot before the pending storage write.
 * @param nextJobs - Queue snapshot after the pending write; newly completed
 * IDs are archived.
 * @param now - Completion time in milliseconds for new records; defaults to
 * Date.now().
 * @returns The original library if no job newly completed, otherwise a pruned
 * library where fresh completions replace matching identities.
 * @throws {import('zod').ZodError} If a new completion cannot form a valid
 *   history record.
 * @throws {Error} If a newly retained record exceeds the library byte budget.
 */
export function recordLibraryCompletions(
  library: DownloadLibrary,
  previousJobs: DownloadJob[],
  nextJobs: DownloadJob[],
  now = Date.now(),
): DownloadLibrary {
  const completed = new Set(
    previousJobs.filter(job => job.status === 'completed').map(job => job.id),
  )
  const additions = nextJobs
    .filter(job => job.status === 'completed' && !completed.has(job.id))
    .map(job => createHistoryRecord(job, now))
  if (!additions.length) {
    return library
  }
  // New completions win when timestamp precision produces a tie.
  const identities = new Set(additions.map(record => record.identity))
  return pruneDownloadLibrary(
    [
      ...additions,
      ...library.records.filter(record => !identities.has(record.identity)),
    ],
    library.evictedCount,
  )
}

/**
 * Removes one asset identity from long-term history without changing eviction
 * accounting.
 *
 * @param library - Current library snapshot, which is not mutated.
 * @param identity - Stable asset identity to remove from the records.
 * @returns A copied library with every matching identity removed.
 */
export function deleteLibraryRecord(
  library: DownloadLibrary,
  identity: string,
): DownloadLibrary {
  return {
    ...library,
    records: library.records.filter(record => record.identity !== identity),
  }
}

/**
 * Creates an empty version-one download library with reset eviction
 * accounting.
 *
 * @returns A fresh library with no records and evictedCount set to zero.
 */
export function createDownloadLibrary(): DownloadLibrary {
  return {
    version: 1,
    records: [],
    evictedCount: 0,
  }
}

/**
 * Requeue the submitted settings snapshot with a new task identity and
 * execution state.
 *
 * @param record - Archived asset and submitted settings to reuse for a fresh
 * download.
 * @param existingJobs - Current queue used to reject an already-active
 * identity or full capacity.
 * @returns A new queued job with a fresh ID and timestamp, retaining the
 * history settings but no execution progress.
 * @throws {Error} If the same asset is active or MAX_PENDING_JOBS is already
 *   reached.
 */
export function createJobFromHistory(
  record: DownloadHistoryRecord,
  existingJobs: DownloadJob[],
): DownloadJob {
  const active = existingJobs.filter(isJobActive)
  if (active.some(job => getJobIdentity(job) === record.identity)) {
    throw new Error('此素材已在下载队列中。')
  }
  if (active.length >= MAX_PENDING_JOBS) {
    throw new Error('下载队列已满，请等待部分任务完成后再添加。')
  }
  return {
    id: crypto.randomUUID(),
    bvid: record.bvid,
    cid: record.cid,
    title: record.title,
    cover: record.cover,
    owner: record.owner,
    page: record.page,
    part: record.part,
    duration: record.duration,
    pageCount: record.pageCount,
    kind: record.kind,
    subtitleLanguage: record.subtitleLanguage,
    filenameTemplate: record.filenameTemplate,
    folderMode: record.folderMode,
    qualityPreference: record.qualityPreference,
    createdAt: Date.now(),
    status: 'queued',
    progress: 0,
    receivedBytes: 0,
    totalBytes: 0,
  }
}

/**
 * Filters history by asset kind and a case-insensitive user-visible metadata
 * query.
 *
 * @param records - History records to filter without mutation or reordering.
 * @param search - Search text; surrounding whitespace is ignored and an empty
 * query matches all records.
 * @param kind - Required asset kind, or all to disable kind filtering.
 * @returns Matching records in their original order, searching title, IDs,
 * owner, part, filename, and asset label.
 */
export function filterLibraryRecords(
  records: DownloadHistoryRecord[],
  search: string,
  kind: DownloadKind | 'all',
): DownloadHistoryRecord[] {
  const query = search.trim().toLocaleLowerCase()
  return records.filter(
    record =>
      (kind === 'all' || record.kind === kind)
      && (!query
        || `${record.title} ${record.bvid} ${record.owner} P${record.page} ${record.part} ${record.filename || ''} ${DOWNLOAD_KIND_LABELS[record.kind]}`
          .toLocaleLowerCase()
          .includes(query)),
  )
}
