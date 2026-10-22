import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  downloadJobsSchema,
  downloadSettingsSchema,
} from '../../types/download'
import { bundleKindsSchema } from '../../types/downloadBundle'
import {
  assertDownloadQueueCapacity,
  clearFinishedDownloadJobs,
  createBundleJobs,
  getBundleTaskCount,
  MAX_DOWNLOAD_QUEUE_BYTES,
  pruneDownloadJobs,
  summarizeDownloadBundles,
} from '../../utils/downloads/bundles'
import {
  createFilename,
  createJobs,
  MAX_PENDING_JOBS,
} from '../../utils/downloads/model'
import type { DownloadJob, VideoInfo } from '../../types/download'

const video: VideoInfo = {
  bvid: 'BV1xx411c7mD',
  title: '组合测试',
  cover: 'https://i0.hdslb.com/example.jpg',
  owner: '测试 UP',
  pages: [
    { cid: 10, page: 1, part: '第一集', duration: 60 },
    { cid: 20, page: 2, part: '第二集', duration: 90 },
    { cid: 30, page: 3, part: '第三集', duration: 120 },
  ],
}

test('expands the selected parts for every asset and creates one cover per video', () => {
  const result = createBundleJobs(video, 2, 'selected', [], {
    kinds: ['video', 'audio', 'cover', 'subtitle', 'danmaku'],
    selectedPages: [2, 3],
    subtitleLanguage: 'zh',
    quality: '720',
  })
  assert.equal(result.jobs.length, 9)
  assert.equal(result.skipped, 0)
  assert.ok(result.bundleId)
  assert.ok(
    result.jobs.every(
      job =>
        job.bundleId === result.bundleId
        && job.bundleSize === 9
        && job.qualityPreference === '720'
        && job.subtitleLanguage === 'zh'
        && job.folderMode === 'video',
    ),
  )
  assert.deepEqual(
    result.jobs.filter(job => job.kind === 'cover').map(job => job.cid),
    [10],
  )
  assert.ok(
    result.jobs
      .filter(job => job.kind !== 'cover')
      .every(job => [20, 30].includes(job.cid)),
  )
  assert.deepEqual(downloadJobsSchema.parse(result.jobs), result.jobs)
  const folders = result.jobs.map(job =>
    createFilename(job).split('/').slice(0, -1).join('/'),
  )
  assert.equal(new Set(folders).size, 1)
})

test('normalizes repeated kinds and validates invalid selections before enqueue', () => {
  assert.deepEqual(bundleKindsSchema.parse(['cover', 'video', 'cover']), [
    'cover',
    'video',
  ])
  assert.equal(getBundleTaskCount(['video', 'cover', 'video'], 3), 4)
  assert.throws(
    () => createBundleJobs(video, 1, 'all', [], { kinds: [] }),
    /至少选择一种/,
  )
  assert.throws(
    () =>
      createBundleJobs(video, 1, 'selected', [], {
        kinds: ['cover', 'audio'],
        selectedPages: [4],
      }),
    /已失效/,
  )
  assert.throws(
    () =>
      createBundleJobs(video, 1, 'selected', [], {
        kinds: ['cover', 'audio'],
        selectedPages: [],
      }),
    /至少选择一个/,
  )
  const cover = createBundleJobs(video, 1, 'selected', [], {
    kinds: ['cover'],
    selectedPages: [],
  })
  assert.equal(cover.jobs.length, 1)
})

test('deduplicates active assets, counts skipped jobs, and keeps subtitle languages distinct', () => {
  const existing = createBundleJobs(video, 2, 'current', [], {
    kinds: ['video', 'cover', 'subtitle'],
    subtitleLanguage: 'zh',
  }).jobs
  const original = structuredClone(existing)
  const result = createBundleJobs(video, 2, 'current', existing, {
    kinds: ['video', 'cover', 'subtitle'],
    subtitleLanguage: 'en',
  })
  assert.equal(result.skipped, 2)
  assert.equal(result.jobs.length, 1)
  assert.equal(result.jobs[0]?.kind, 'subtitle')
  assert.equal(result.jobs[0]?.subtitleLanguage, 'en')
  assert.equal(result.jobs[0]?.bundleSize, 1)
  assert.deepEqual(existing, original)
  const duplicate = createBundleJobs(video, 2, 'current', existing, {
    kinds: ['video', 'cover', 'subtitle'],
    subtitleLanguage: 'zh',
  })
  assert.deepEqual(duplicate, { jobs: [], skipped: 3 })
})

test('archive directories preserve owner grouping and do not change single-asset settings', () => {
  const settings = downloadSettingsSchema.parse({
    folderMode: 'owner',
    filenameTemplate: '{bvid}_{type}_{page}',
  })
  const bundle = createBundleJobs(video, 1, 'all', [], {
    kinds: ['video', 'cover'],
    settings,
  })
  assert.ok(bundle.jobs.every(job => job.folderMode === 'owner-video'))
  assert.ok(
    bundle.jobs.every(
      job => job.filenameTemplate === settings.filenameTemplate,
    ),
  )
  assert.equal(
    createJobs(video, 1, 'current', [], { settings })[0]?.folderMode,
    'owner',
  )
  assert.equal(settings.folderMode, 'owner')
})

test('capacity failures leave the original queue untouched instead of partially adding a bundle', () => {
  const [base] = createJobs(video, 1, 'current', [])
  assert.ok(base)
  const existing = Array.from({ length: MAX_PENDING_JOBS - 1 }, (_, index) => ({
    ...base,
    id: `existing-${index}`,
    cid: 1000 + index,
  }))
  const original = structuredClone(existing)
  assert.throws(
    () =>
      createBundleJobs(video, 1, 'current', existing, {
        kinds: ['video', 'cover'],
      }),
    /队列已满/,
  )
  assert.deepEqual(existing, original)
})

test('summaries never mark failed, cancelled, or missing members as completed', () => {
  const jobs = createBundleJobs(video, 1, 'all', [], { kinds: ['video'] }).jobs
  const states: DownloadJob[] = jobs.map((job, index) => ({
    ...job,
    status: index === 0 ? 'completed' : index === 1 ? 'failed' : 'cancelled',
    progress: 100,
  }))
  const [summary] = summarizeDownloadBundles(states)
  assert.ok(summary)
  assert.equal(summary.status, 'failed')
  assert.equal(summary.total, 3)
  assert.equal(summary.completed, 1)
  assert.equal(summary.failed, 1)
  assert.equal(summary.cancelled, 1)
  assert.equal(summary.progress, 33)
  const [incomplete] = summarizeDownloadBundles(states.slice(0, 1))
  assert.equal(incomplete?.status, 'incomplete')
  assert.equal(incomplete?.missing, 2)
  const [complete] = summarizeDownloadBundles(
    jobs.map(job => ({
      ...job,
      status: 'completed',
      progress: 100,
    })),
  )
  assert.equal(complete?.status, 'completed')
  assert.equal(complete?.progress, 100)
})

test('history pruning and clearing preserve every member of a large active bundle', () => {
  const pages = Array.from({ length: 150 }, (_, index) => ({
    cid: index + 1,
    page: index + 1,
    part: `第 ${index + 1} 集`,
    duration: 60,
  }))
  const jobs = createBundleJobs({ ...video, pages }, 1, 'all', [], {
    kinds: ['video'],
  }).jobs.map((job, index): DownloadJob => ({
    ...job,
    status: index < 149 ? 'completed' : 'queued',
  }))
  const [base] = createJobs(video, 1, 'current', [])
  assert.ok(base)
  const unrelated = Array.from({ length: 200 }, (_, index): DownloadJob => ({
    ...base,
    id: `unrelated-${index}`,
    status: 'completed',
  }))
  const pruned = pruneDownloadJobs([...jobs, ...unrelated])
  assert.equal(pruned.length, 250)
  assert.equal(summarizeDownloadBundles(pruned)[0]?.completed, 149)
  assert.deepEqual(clearFinishedDownloadJobs(pruned), jobs)
  const completed: DownloadJob[] = jobs.map(job => ({
    ...job,
    status: 'completed',
  }))
  assert.equal(pruneDownloadJobs([...unrelated, ...completed]).length, 150)
  assert.equal(
    pruneDownloadJobs([...completed, ...unrelated.slice(0, 1)]).length,
    151,
  )
  assert.deepEqual(
    pruneDownloadJobs([...completed, ...unrelated]),
    unrelated.slice(-100),
  )
  assert.deepEqual(clearFinishedDownloadJobs(completed), [])
})

test('paused bundles reserve all their members so accumulated completed assets cannot exceed the queue bound', () => {
  const pages = Array.from({ length: MAX_PENDING_JOBS }, (_, index) => ({
    cid: index + 1,
    page: index + 1,
    part: `第 ${index + 1} 集`,
    duration: 60,
  }))
  const existing = createBundleJobs({ ...video, pages }, 1, 'all', [], {
    kinds: ['video'],
  }).jobs.map((job, index): DownloadJob => ({
    ...job,
    status: index < MAX_PENDING_JOBS - 1 ? 'completed' : 'paused',
  }))
  const [addition] = createJobs(video, 1, 'current', [], { kind: 'cover' })
  assert.ok(addition)
  assert.throws(
    () => createBundleJobs(video, 1, 'current', existing, { kinds: ['cover'] }),
    /组合全部结束/,
  )
  assert.throws(
    () => assertDownloadQueueCapacity(existing, [...existing, addition]),
    /组合全部结束/,
  )
  const finished = existing.map((job): DownloadJob => ({
    ...job,
    status: 'completed',
  }))
  assert.doesNotThrow(() =>
    assertDownloadQueueCapacity(finished, [...finished, addition]),
  )
  const oversized = [...existing, addition]
  assert.doesNotThrow(() =>
    assertDownloadQueueCapacity(
      oversized,
      oversized.map((job): DownloadJob => ({
        ...job,
        status: 'cancelled',
      })),
    ),
  )
})

test('new work reserves storage growth and finished history is evicted as complete groups at the byte bound', () => {
  const [base] = createJobs(video, 1, 'current', [])
  assert.ok(base)
  const oversized = { ...base, title: 'x'.repeat(MAX_DOWNLOAD_QUEUE_BYTES) }
  assert.throws(() => assertDownloadQueueCapacity([], [oversized]), /存储上限/)
  assert.doesNotThrow(() =>
    assertDownloadQueueCapacity([oversized], [{ ...oversized, progress: 50 }]),
  )
  const jobs = createBundleJobs(video, 1, 'all', [], {
    kinds: ['video'],
  }).jobs.map((job): DownloadJob => ({
    ...job,
    title: oversized.title,
    status: 'completed',
  }))
  assert.deepEqual(pruneDownloadJobs(jobs), [])
})

test('retrying a finished bundle reserves its whole group again before any member is requeued', () => {
  const jobs = createBundleJobs(video, 1, 'all', [], {
    kinds: ['video'],
  }).jobs.map((job): DownloadJob => ({
    ...job,
    status: 'failed',
  }))
  const [base] = createJobs(video, 1, 'current', [], { kind: 'audio' })
  assert.ok(base)
  const active = Array.from(
    { length: MAX_PENDING_JOBS - 1 },
    (_, index): DownloadJob => ({
      ...base,
      id: `retry-capacity-${index}`,
      cid: index + 1000,
    }),
  )
  const existing = [...jobs, ...active]
  const next = existing.map((job, index): DownloadJob =>
    index === 0 ? { ...job, status: 'queued' } : job,
  )
  assert.throws(
    () => assertDownloadQueueCapacity(existing, next),
    /组合全部结束/,
  )
})
