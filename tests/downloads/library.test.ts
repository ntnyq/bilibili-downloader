import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_FILENAME_TEMPLATE } from '../../types/download'
import {
  downloadLibrarySchema,
  MAX_LIBRARY_BYTES,
  MAX_LIBRARY_RECORDS,
} from '../../types/downloadHistory'
import { createBatchJobs } from '../../utils/downloads/batch/jobs'
import { MAX_PENDING_JOBS } from '../../utils/downloads/constants'
import {
  createDownloadLibrary,
  createJobFromHistory,
  deleteLibraryRecord,
  filterLibraryRecords,
  initializeDownloadLibrary,
  pruneDownloadLibrary,
  recordLibraryCompletions,
} from '../../utils/downloads/history/library'
import { serializeDownloadHistory } from '../../utils/downloads/history/serializeDownloadHistory'
import { getJobIdentity } from '../../utils/downloads/queue/identity'
import type { DownloadJob, VideoInfo } from '../../types/download'

function createJob(index = 1): DownloadJob {
  return {
    id: `job-${index}`,
    bvid: 'BV1xx411c7mD',
    cid: index,
    page: index,
    part: `第 ${index} 集`,
    duration: 60,
    title: '示例课程',
    cover: 'https://i0.hdslb.com/cover.jpg',
    owner: '示例 UP',
    pageCount: 6000,
    kind: 'video',
    subtitleLanguage: 'auto',
    filenameTemplate: '{owner}_{title}_{page}',
    folderMode: 'owner-video',
    createdAt: index,
    runId: `old-run-${index}`,
    status: 'completed',
    progress: 100,
    receivedBytes: 500,
    totalBytes: 500,
    qualityPreference: '720',
    quality: '720P',
    filename: `Bilibili/course-${index}.mp4`,
    downloadId: index,
  }
}

test('migration archives completed jobs once without inventing dates or storing execution IDs', () => {
  const jobs = [
    createJob(),
    { ...createJob(2), status: 'failed' as const },
    { ...createJob(3), status: 'cancelled' as const },
    { ...createJob(4), status: 'queued' as const },
  ]
  const snapshot = structuredClone(jobs)
  const library = initializeDownloadLibrary(undefined, jobs)
  assert.equal(library.records.length, 1)
  const record = library.records[0]
  assert.ok(record)
  assert.equal(record.identity, getJobIdentity(jobs[0]!))
  assert.equal(record.completedAt, undefined)
  assert.equal(record.createdAt, 1)
  assert.equal('runId' in record, false)
  assert.equal('downloadId' in record, false)
  assert.equal('error' in record, false)
  assert.deepEqual(jobs, snapshot)
  const empty = createDownloadLibrary()
  assert.deepEqual(initializeDownloadLibrary(empty, jobs), empty)
})

test('only new completion transitions archive and deletion never reimports unchanged jobs', () => {
  const completed = createJob()
  const previous = [{ ...completed, status: 'saving' as const }]
  const empty = createDownloadLibrary()
  const library = recordLibraryCompletions(empty, previous, [completed], 9000)
  assert.equal(library.records[0]?.completedAt, 9000)
  const progress = [{ ...createJob(2), status: 'downloading' as const }]
  assert.equal(recordLibraryCompletions(library, [], progress), library)
  assert.equal(
    recordLibraryCompletions(library, [completed], [completed]),
    library,
  )
  const deleted = deleteLibraryRecord(library, getJobIdentity(completed))
  assert.equal(deleted.records.length, 0)
  assert.equal(
    recordLibraryCompletions(deleted, [completed], [completed, ...progress]),
    deleted,
  )
  assert.deepEqual(initializeDownloadLibrary(deleted, [completed]), deleted)
  const requeued = { ...completed, id: 'new-job', createdAt: 10000 }
  const archivedAgain = recordLibraryCompletions(
    deleted,
    [completed],
    [completed, requeued],
    11000,
  )
  assert.equal(archivedAgain.records[0]?.id, 'new-job')
})

test('latest completion per material replaces its snapshot, including equal timestamp ties', () => {
  const completed = createJob()
  const first = recordLibraryCompletions(
    createDownloadLibrary(),
    [],
    [completed],
    500,
  )
  const next = {
    ...completed,
    id: 'repeat',
    filename: 'new.mp4',
    qualityPreference: '1080' as const,
  }
  const library = recordLibraryCompletions(
    first,
    [completed],
    [completed, next],
    500,
  )
  assert.equal(library.records.length, 1)
  assert.equal(library.records[0]?.id, 'repeat')
  assert.equal(library.records[0]?.filename, 'new.mp4')
  assert.equal(library.records[0]?.qualityPreference, '1080')
  const subtitles = [
    {
      ...createJob(),
      id: 'zh',
      kind: 'subtitle' as const,
      subtitleLanguage: 'zh' as const,
    },
    {
      ...createJob(),
      id: 'en',
      kind: 'subtitle' as const,
      subtitleLanguage: 'en' as const,
    },
  ]
  const separate = recordLibraryCompletions(library, [], subtitles, 501)
  assert.equal(separate.records.length, 3)
  assert.deepEqual(
    separate.records.slice(0, 2).map(record => record.kind),
    ['subtitle', 'subtitle'],
  )
})

test('count budget retains newest 5000 unique records independently from the 100-job queue', () => {
  const jobs = Array.from({ length: MAX_LIBRARY_RECORDS + 3 }, (_, index) =>
    createJob(index + 1),
  )
  const library = initializeDownloadLibrary(undefined, jobs)
  assert.equal(library.records.length, MAX_LIBRARY_RECORDS)
  assert.equal(library.records[0]?.cid, MAX_LIBRARY_RECORDS + 3)
  assert.equal(library.records.at(-1)?.cid, 4)
  assert.equal(library.evictedCount, 3)
  assert.deepEqual(initializeDownloadLibrary(library, jobs), library)
  const afterQueueClear = recordLibraryCompletions(library, jobs, [])
  assert.equal(afterQueueClear, library)
})

test('byte budget counts encoded Unicode metadata and reports all oldest evictions', () => {
  const jobs = Array.from({ length: 1000 }, (_, index) => ({
    ...createJob(index + 1),
    title: '课'.repeat(1000),
    part: '程'.repeat(1000),
    filename: '名'.repeat(1024),
  }))
  const library = initializeDownloadLibrary(undefined, jobs)
  assert.ok(library.records.length > 100)
  assert.ok(library.records.length < 1000)
  assert.equal(library.records[0]?.cid, 1000)
  assert.equal(library.evictedCount, 1000 - library.records.length)
  assert.ok(
    new TextEncoder().encode(JSON.stringify(library)).byteLength
      <= MAX_LIBRARY_BYTES,
  )
  const extra = { ...createJob(1001), title: '课'.repeat(1000) }
  const updated = recordLibraryCompletions(library, [], [extra], 2000)
  assert.ok(updated.evictedCount >= library.evictedCount)
  assert.ok(
    new TextEncoder().encode(JSON.stringify(updated)).byteLength
      <= MAX_LIBRARY_BYTES,
  )
  assert.equal(downloadLibrarySchema.safeParse(updated).success, true)
})

test('metadata is bounded before persisting and oversized standalone records fail explicitly', () => {
  const library = initializeDownloadLibrary(undefined, [
    {
      ...createJob(),
      title: 'a'.repeat(2000),
      owner: 'b'.repeat(300),
      part: 'c'.repeat(2000),
      filename: 'd'.repeat(2000),
      quality: 'e'.repeat(300),
      cover: `https://example.com/${'x'.repeat(2048)}`,
    },
  ])
  const record = library.records[0]
  assert.ok(record)
  assert.equal(record.title.length, 1000)
  assert.equal(record.owner.length, 200)
  assert.equal(record.part.length, 1000)
  assert.equal(record.filename?.length, 1024)
  assert.equal(record.quality?.length, 200)
  assert.equal(record.cover, '')
  assert.throws(
    () =>
      pruneDownloadLibrary([
        { ...record, title: 'x'.repeat(MAX_LIBRARY_BYTES) },
      ]),
    /存储上限/,
  )
})

test('corrupt stored records fail instead of being silently replaced with empty history', () => {
  for (const stored of [
    null,
    {},
    { version: 2, records: [] },
    { version: 1, records: [{}] },
  ]) {
    assert.throws(
      () => initializeDownloadLibrary(stored, [createJob()]),
      /格式损坏/,
    )
  }
  const library = initializeDownloadLibrary(undefined, [createJob()])
  const record = library.records[0]
  assert.ok(record)
  assert.throws(
    () =>
      initializeDownloadLibrary(
        { ...library, records: [{ ...record, identity: 'wrong' }] },
        [],
      ),
    /格式损坏/,
  )
})

test('requeue preserves submitted settings and metadata with fresh identity and execution state', () => {
  const record = initializeDownloadLibrary(undefined, [createJob()]).records[0]
  assert.ok(record)
  const snapshot = structuredClone(record)
  const job = createJobFromHistory(record, [])
  assert.notEqual(job.id, record.id)
  assert.notEqual(job.id, createJobFromHistory(record, []).id)
  assert.ok(job.createdAt > record.createdAt)
  assert.equal(job.status, 'queued')
  assert.equal(job.progress, 0)
  assert.equal(job.receivedBytes, 0)
  assert.equal(job.totalBytes, 0)
  for (const field of [
    'runId',
    'downloadId',
    'error',
    'quality',
    'filename',
    'identity',
    'completedAt',
  ]) {
    assert.equal(field in job, false)
  }
  for (const field of [
    'bvid',
    'cid',
    'page',
    'part',
    'pageCount',
    'title',
    'owner',
    'kind',
    'subtitleLanguage',
    'qualityPreference',
    'filenameTemplate',
    'folderMode',
  ] as const) {
    assert.equal(job[field], record[field])
  }
  assert.deepEqual(record, snapshot)
  assert.throws(() => createJobFromHistory(record, [job]), /已在下载队列/)
  assert.equal(createJobFromHistory(record, [createJob()]).status, 'queued')
  const full = Array.from({ length: MAX_PENDING_JOBS }, (_, index) => ({
    ...createJob(index + 2),
    status: 'queued' as const,
  }))
  assert.throws(() => createJobFromHistory(record, full), /队列已满/)
})

test('library identity skips older than 100 records, supports override and forgets deleted entries', () => {
  const jobs = Array.from({ length: 150 }, (_, index) => createJob(index + 1))
  const library = initializeDownloadLibrary(undefined, jobs)
  const video: VideoInfo = {
    bvid: 'BV1xx411c7mD',
    title: '示例课程',
    owner: '',
    cover: '',
    pages: [{ cid: 1, page: 1, part: '第 1 集', duration: 60 }],
  }
  const options = {
    mode: 'all' as const,
    quality: 'best' as const,
    kind: 'video' as const,
    subtitleLanguage: 'auto' as const,
    skipCompleted: true,
    filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
    folderMode: 'flat' as const,
  }
  const completed = library.records.map(record => record.identity)
  const recentQueue = jobs.slice(-100)
  assert.equal(
    createBatchJobs(video, { page: 1 }, recentQueue, options).jobs.length,
    1,
  )
  assert.equal(
    createBatchJobs(video, { page: 1 }, recentQueue, options, completed)
      .skipped,
    1,
  )
  assert.equal(
    createBatchJobs(
      video,
      { page: 1 },
      recentQueue,
      { ...options, skipCompleted: false },
      completed,
    ).jobs.length,
    1,
  )
  assert.equal(
    createBatchJobs(video, { page: 1 }, jobs, options, []).jobs.length,
    1,
  )
  const active = [{ ...createJob(), status: 'queued' as const }]
  assert.equal(
    createBatchJobs(
      video,
      { page: 1 },
      active,
      { ...options, skipCompleted: false },
      [],
    ).skipped,
    1,
  )
})

test('search supports title, owner, BV, part and filename alongside material filters and safe export', () => {
  const library = initializeDownloadLibrary(undefined, [
    createJob(),
    { ...createJob(2), kind: 'audio', owner: '另一位 UP' },
  ])
  assert.equal(
    filterLibraryRecords(library.records, '  BV1xx411c7mD ', 'all').length,
    2,
  )
  assert.equal(
    filterLibraryRecords(library.records, '示例 UP', 'all').length,
    1,
  )
  assert.equal(
    filterLibraryRecords(library.records, '第 2 集', 'audio').length,
    1,
  )
  assert.equal(
    filterLibraryRecords(library.records, 'course-1.mp4', 'video').length,
    1,
  )
  assert.equal(
    filterLibraryRecords(library.records, '第 2 集', 'video').length,
    0,
  )
  const exported = serializeDownloadHistory(library.records, 'json')
  assert.equal(exported.includes('downloadId'), false)
  assert.equal(exported.includes('runId'), false)
  assert.equal(exported.includes('course-1.mp4'), true)
})
