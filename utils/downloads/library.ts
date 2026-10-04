import {
  downloadHistoryRecordSchema,
  downloadLibrarySchema,
  MAX_LIBRARY_BYTES,
  MAX_LIBRARY_RECORDS,
} from '../../types/downloadHistory'
import { DOWNLOAD_KIND_LABELS, jobIdentity } from './assets'
import { isJobActive, MAX_PENDING_JOBS } from './model'
import type { DownloadJob, DownloadKind } from '../../types/download'
import type {
  DownloadHistoryRecord,
  DownloadLibrary,
} from '../../types/downloadHistory'

const encoder = new TextEncoder()

function createHistoryRecord(
  job: DownloadJob,
  completedAt?: number,
): DownloadHistoryRecord {
  return downloadHistoryRecordSchema.parse({
    ...job,
    id: job.id.slice(0, 128),
    identity: jobIdentity(job),
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
 * Keep the newest completion per identity, evicting oldest records at either bound.
 */
export function boundDownloadLibrary(
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
 * Catalog presence marks migration as complete, including an intentionally empty one.
 * Imported jobs have no invented completion time because old queues did not track it.
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
        record => record.identity !== jobIdentity(record),
      )
    ) {
      throw new Error(
        '长期下载记录格式损坏，无法读取。可清空长期记录后重新建立。',
      )
    }
    return boundDownloadLibrary(result.data.records, result.data.evictedCount)
  }
  return boundDownloadLibrary(
    jobs
      .filter(job => job.status === 'completed')
      .map(job => createHistoryRecord(job)),
  )
}

/**
 * Archive transitions only, so removed history never reappears on unrelated queue writes.
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
  return boundDownloadLibrary(
    [
      ...additions,
      ...library.records.filter(record => !identities.has(record.identity)),
    ],
    library.evictedCount,
  )
}

export function deleteLibraryRecord(
  library: DownloadLibrary,
  identity: string,
): DownloadLibrary {
  return {
    ...library,
    records: library.records.filter(record => record.identity !== identity),
  }
}

export function clearDownloadLibrary(): DownloadLibrary {
  return {
    version: 1,
    records: [],
    evictedCount: 0,
  }
}

/**
 * Requeue the submitted settings snapshot with a new task identity and execution state.
 */
export function createLibraryJob(
  record: DownloadHistoryRecord,
  existingJobs: DownloadJob[],
): DownloadJob {
  const active = existingJobs.filter(isJobActive)
  if (active.some(job => jobIdentity(job) === record.identity)) {
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
