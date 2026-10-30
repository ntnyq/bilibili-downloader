import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_FILENAME_TEMPLATE } from '../../types/download'
import {
  BatchQueueFullError,
  createBatchJobs,
} from '../../utils/downloads/batch/jobs'
import { MAX_PENDING_JOBS } from '../../utils/downloads/constants'
import { createDownloadJobs } from '../../utils/downloads/queue/jobs'
import type { DownloadJob, VideoInfo } from '../../types/download'

const video: VideoInfo = {
  bvid: 'BV1xx411c7mD',
  title: '批量课程',
  cover: 'https://i0.hdslb.com/cover.jpg',
  owner: '测试 UP',
  pages: [1, 2, 3].map(page => ({
    cid: page * 10,
    page,
    part: `第 ${page} 集`,
    duration: 60,
  })),
}

const options = {
  mode: 'all',
  quality: '720',
  kind: 'video',
  subtitleLanguage: 'auto',
  skipCompleted: true,
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  folderMode: 'flat',
} satisfies Parameters<typeof createBatchJobs>[3]

function createHistory(status: DownloadJob['status']): DownloadJob[] {
  return createDownloadJobs(video, 1, 'all', []).map(job => ({
    ...job,
    status,
  }))
}

test('all mode preserves source order and snapshots queue settings without mutating inputs', () => {
  const source = { ...video, pages: [...video.pages].reverse() }
  const existing = createHistory('completed').slice(1, 2)
  const settings = {
    ...options,
    filenameTemplate: '{owner}_{title}_{page}',
    folderMode: 'owner-video' as const,
  }
  const snapshot = structuredClone({ source, existing, settings })
  const result = createBatchJobs(source, { page: 1 }, existing, settings)
  assert.deepEqual(
    result.jobs.map(job => job.page),
    [3, 1],
  )
  assert.equal(result.skipped, 1)
  for (const job of result.jobs) {
    assert.equal(job.pageCount, 3)
    assert.equal(job.qualityPreference, '720')
    assert.equal(job.filenameTemplate, settings.filenameTemplate)
    assert.equal(job.folderMode, 'owner-video')
    assert.equal(job.status, 'queued')
    assert.equal(job.owner, video.owner)
    assert.equal(job.cover, video.cover)
  }
  assert.deepEqual({ source, existing, settings }, snapshot)
  assert.notEqual(result.jobs[0]?.id, result.jobs[1]?.id)
  settings.filenameTemplate = '{bvid}'
  assert.equal(result.jobs[0]?.filenameTemplate, '{owner}_{title}_{page}')
})

test('current mode respects source page and rejects missing or invalid parts', () => {
  const current = { ...options, mode: 'current' as const }
  const result = createBatchJobs(video, { page: 2 }, [], current)
  assert.deepEqual(
    result.jobs.map(job => job.cid),
    [20],
  )
  for (const page of [0, -1, 1.5, 4, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => createBatchJobs(video, { page }, [], current),
      /当前分 P/,
    )
  }
})

test('canonical BV metadata deduplicates active work across resolved source aliases', () => {
  const existing = createHistory('downloading')
  const resolvedFromAv = structuredClone(video)
  assert.deepEqual(
    createBatchJobs(resolvedFromAv, { page: 1 }, existing, {
      ...options,
      skipCompleted: false,
    }),
    { jobs: [], skipped: 3 },
  )
})

test('completed skipping is optional and failed or cancelled history remains eligible', () => {
  const completed = createHistory('completed')
  assert.deepEqual(createBatchJobs(video, { page: 1 }, completed, options), {
    jobs: [],
    skipped: 3,
  })
  assert.equal(
    createBatchJobs(video, { page: 1 }, completed, {
      ...options,
      skipCompleted: false,
    }).jobs.length,
    3,
  )
  const history = [...createHistory('failed'), ...createHistory('cancelled')]
  const result = createBatchJobs(video, { page: 1 }, history, options)
  assert.equal(result.jobs.length, 3)
  assert.equal(result.skipped, 0)
})

test('identity distinguishes media and subtitle language but ignores video quality', () => {
  const existing = createHistory('completed')
  assert.equal(
    createBatchJobs(video, { page: 1 }, existing, {
      ...options,
      kind: 'audio',
    }).jobs.length,
    3,
  )
  const subtitles = createDownloadJobs(video, 1, 'all', [], {
    kind: 'subtitle',
    subtitleLanguage: 'zh',
  })
  for (const subtitleLanguage of ['auto', 'en'] as const) {
    assert.equal(
      createBatchJobs(video, { page: 1 }, subtitles, {
        ...options,
        kind: 'subtitle',
        subtitleLanguage,
      }).jobs.length,
      3,
    )
  }
  assert.equal(
    createBatchJobs(video, { page: 1 }, subtitles, {
      ...options,
      kind: 'subtitle',
      subtitleLanguage: 'zh',
    }).skipped,
    3,
  )
  assert.equal(
    createBatchJobs(video, { page: 1 }, existing, {
      ...options,
      quality: '1080',
      subtitleLanguage: 'en',
    }).skipped,
    3,
  )
})

test('covers create one job per BV even when different parts request the same cover', () => {
  const coverOptions = { ...options, kind: 'cover' as const }
  const first = createBatchJobs(video, { page: 2 }, [], coverOptions)
  assert.equal(first.jobs.length, 1)
  assert.equal(first.jobs[0]?.pageCount, 3)
  assert.deepEqual(
    createBatchJobs(video, { page: 3 }, first.jobs, coverOptions),
    { jobs: [], skipped: 1 },
  )
  assert.equal(
    createBatchJobs(
      { ...video, bvid: 'BV1yy411c7mD' },
      { page: 1 },
      first.jobs,
      coverOptions,
    ).jobs.length,
    1,
  )
})

test('queue capacity counts actual active tasks and rejects a video atomically', () => {
  const first = createHistory('queued')[0]
  assert.ok(first)
  const existing = Array.from({ length: MAX_PENDING_JOBS - 2 }, (_, index) => ({
    ...first,
    id: `queued-${index}`,
    cid: 999,
  }))
  const snapshot = structuredClone(existing)
  assert.throws(
    () => createBatchJobs(video, { page: 1 }, existing, options),
    BatchQueueFullError,
  )
  assert.deepEqual(existing, snapshot)
  const completed = createHistory('completed').slice(0, 1)
  const result = createBatchJobs(
    video,
    { page: 1 },
    [...existing, ...completed],
    options,
  )
  assert.equal(result.jobs.length, 2)
  assert.equal(result.skipped, 1)
  assert.equal(existing.length + result.jobs.length, MAX_PENDING_JOBS)
})

test('a full queue can still skip existing work and completed history does not consume capacity', () => {
  const first = createHistory('queued')[0]
  assert.ok(first)
  const full = Array.from({ length: MAX_PENDING_JOBS }, (_, index) => ({
    ...first,
    id: `queued-${index}`,
  }))
  assert.deepEqual(
    createBatchJobs(video, { page: 1 }, full, {
      ...options,
      mode: 'current',
    }),
    { jobs: [], skipped: 1 },
  )
  assert.throws(
    () =>
      createBatchJobs(video, { page: 2 }, full, {
        ...options,
        mode: 'current',
      }),
    BatchQueueFullError,
  )
  const completed = full.map(job => ({
    ...job,
    status: 'completed' as const,
  }))
  assert.equal(
    createBatchJobs(video, { page: 1 }, completed, options).jobs.length,
    2,
  )
})

test('completed filtering happens before capacity checks for videos over 1000 parts', () => {
  const source = {
    ...video,
    pages: Array.from({ length: MAX_PENDING_JOBS + 1 }, (_, index) => ({
      page: index + 1,
      cid: index + 100,
      part: `第 ${index + 1} 集`,
      duration: 60,
    })),
  }
  const first = createHistory('completed')[0]
  assert.ok(first)
  const existing = source.pages.slice(0, -1).map(page => ({
    ...first,
    ...page,
    id: `completed-${page.page}`,
  }))
  const result = createBatchJobs(source, { page: 1 }, existing, options)
  assert.equal(result.jobs.length, 1)
  assert.equal(result.jobs[0]?.pageCount, MAX_PENDING_JOBS + 1)
  assert.equal(result.skipped, MAX_PENDING_JOBS)
})
