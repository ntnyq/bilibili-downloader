import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_FILENAME_TEMPLATE,
  downloadJobSchema,
  downloadSettingsPatchSchema,
  downloadSettingsSchema,
} from '../../types/download'
import { MAX_PENDING_JOBS } from '../../utils/downloads/constants'
import {
  createDownloadJobs,
  getNextQueuedJob,
  retryDownloadJobs,
} from '../../utils/downloads/queue/jobs'
import type { VideoInfo } from '../../types/download'

const video: VideoInfo = {
  bvid: 'BV1xx411c7mD',
  title: '课程',
  cover: '',
  owner: 'UP',
  pages: [1, 2, 3].map(page => ({
    page,
    cid: page * 10,
    part: `第 ${page} 课`,
    duration: 60,
  })),
}

test('custom parts validate all input, retain source order and deduplicate active work', () => {
  const options = { selectedPages: [3, 1, 3], quality: '720' as const }
  const jobs = createDownloadJobs(video, 2, 'selected', [], options)
  assert.deepEqual(
    jobs.map(job => job.page),
    [1, 3],
  )
  assert.ok(jobs.every(job => job.qualityPreference === '720'))
  assert.equal(
    createDownloadJobs(video, 2, 'selected', jobs, options).length,
    0,
  )
  assert.throws(() => createDownloadJobs(video, 2, 'selected', []), /至少选择/)
  for (const invalid of [[1, 4], [0], [1.5]]) {
    assert.throws(
      () =>
        createDownloadJobs(video, 2, 'selected', [], {
          selectedPages: invalid,
        }),
      /失效/,
    )
  }
})

test('old persisted jobs migrate to best; settings patches never reset unrelated fields', () => {
  const [job] = createDownloadJobs(video, 1, 'current', [])
  assert.ok(job)
  const legacy = { ...job, qualityPreference: undefined }
  assert.equal(downloadJobSchema.parse(legacy).qualityPreference, 'best')
  assert.deepEqual(downloadSettingsSchema.parse({}), {
    quality: 'best',
    doubleClickKind: 'video',
    isPaused: false,
    filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
    folderMode: 'flat',
    notifyOnComplete: false,
  })
  const settings = { quality: '720', isPaused: false }
  assert.deepEqual(
    { ...settings, ...downloadSettingsPatchSchema.parse({ isPaused: true }) },
    { quality: '720', isPaused: true },
  )
  assert.deepEqual(downloadSettingsPatchSchema.parse({ quality: '480' }), {
    quality: '480',
  })
  assert.equal(
    downloadSettingsSchema.safeParse({ quality: '9999' }).success,
    false,
  )
})

test('pause prevents new claims while keeping an active task and queue intact', () => {
  const jobs = createDownloadJobs(video, 1, 'all', [])
  assert.equal(getNextQueuedJob(jobs, true), undefined)
  assert.equal(getNextQueuedJob(jobs, false)?.page, 1)
  const running = jobs.map((job, index) =>
    index === 0 ? { ...job, status: 'downloading' as const } : job,
  )
  assert.equal(getNextQueuedJob(running, false), undefined)
  assert.equal(getNextQueuedJob(running, true), undefined)
  assert.equal(running[0]?.status, 'downloading')
  assert.equal(
    getNextQueuedJob(
      running.map(job =>
        job.page === 1 ? { ...job, status: 'completed' as const } : job,
      ),
      false,
    )?.page,
    2,
  )
})

test('batch retry ignores cancelled and duplicate work, preserves preference and resets execution', () => {
  const jobs = createDownloadJobs(video, 1, 'all', [], { quality: '480' })
  const first = jobs[0]
  assert.ok(first)
  const failed = {
    ...first,
    status: 'failed' as const,
    runId: 'old',
    error: 'network',
    quality: '480P',
    downloadId: 8,
    progress: 60,
  }
  const cancelled = jobs[1]
  const active = jobs[2]
  assert.ok(cancelled && active)
  const history = [
    failed,
    { ...failed, id: 'duplicate' },
    { ...cancelled, status: 'cancelled' as const },
    active,
    { ...active, id: 'active-duplicate', status: 'failed' as const },
  ]
  const result = retryDownloadJobs(history)
  assert.equal(result.filter(job => job.status === 'queued').length, 2)
  assert.equal(result[1]?.status, 'failed')
  assert.equal(result[2]?.status, 'cancelled')
  assert.equal(result[4]?.status, 'failed')
  assert.equal(result[0]?.qualityPreference, '480')
  assert.equal(result[0]?.quality, undefined)
  assert.equal(result[0]?.downloadId, undefined)
  assert.equal(result[0]?.runId, undefined)
  assert.equal(result[0]?.progress, 0)
  assert.equal(history[0]?.status, 'failed')
  assert.equal(retryDownloadJobs(history, cancelled.id)[2]?.status, 'queued')
  assert.throws(() => retryDownloadJobs(result, 'duplicate'), /已在下载队列/)
})

test('retry rejects capacity overflow atomically', () => {
  const first = createDownloadJobs(video, 1, 'current', [])[0]
  assert.ok(first)
  const jobs = Array.from({ length: MAX_PENDING_JOBS }, (_, index) => ({
    ...first,
    id: `queued-${index}`,
    cid: index + 100,
  }))
  const failed = { ...first, status: 'failed' as const }
  assert.throws(() => retryDownloadJobs([...jobs, failed]), /队列已满/)
  assert.equal(failed.status, 'failed')
})
