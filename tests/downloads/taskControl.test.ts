import assert from 'node:assert/strict'
import { test } from 'node:test'
import { downloadJobsSchema } from '../../types/download'
import { fetchCachedMedia } from '../../utils/downloads/media/fetchCachedMedia'
import {
  abortChangedJobRun,
  abortStaleJobRun,
  canApplyJobUpdate,
  canPauseJob,
  confirmJobUpdate,
  isJobRunning,
  JobPausedError,
  moveQueuedJob,
  pauseJob,
  resumeJob,
  shouldClearAbortedJobCache,
} from '../../utils/downloads/queue/control'
import {
  createDownloadJobs,
  getNextQueuedJob,
  isJobActive,
  retryDownloadJobs,
} from '../../utils/downloads/queue/jobs'
import type { DownloadJob, VideoInfo } from '../../types/download'
import type {
  CachedMediaState,
  MediaCache,
} from '../../utils/downloads/media/mediaCache'

const video: VideoInfo = {
  bvid: 'BV1xx411c7mD',
  title: '任务控制测试',
  cover: '',
  owner: '',
  pages: [
    { cid: 10, page: 1, part: '第一集', duration: 60 },
    { cid: 20, page: 2, part: '第二集', duration: 90 },
    { cid: 30, page: 3, part: '第三集', duration: 120 },
  ],
}

function createJob(options: Partial<DownloadJob> = {}): DownloadJob {
  const [job] = createDownloadJobs(video, 1, 'current', [])
  assert.ok(job)
  return {
    ...job,
    ...options,
  }
}

test('pausing a running job retains progress, prevents cleanup and allows the next task', () => {
  const running = createJob({
    runId: 'first-run',
    status: 'downloading',
    progress: 31,
    receivedBytes: 120,
    totalBytes: 400,
  })
  const waiting = createJob({ id: 'waiting', cid: 20 })
  assert.equal(getNextQueuedJob([running, waiting], false), undefined)
  const paused = downloadJobsSchema.parse(
    pauseJob([running, waiting], running.id),
  )
  assert.equal(paused[0]?.status, 'paused')
  assert.equal(paused[0]?.runId, undefined)
  assert.equal(paused[0]?.progress, 31)
  assert.equal(paused[0]?.receivedBytes, 120)
  assert.equal(paused.filter(isJobActive).length, 2)
  assert.equal(getNextQueuedJob(paused, false)?.id, waiting.id)
  assert.equal(getNextQueuedJob(paused, true), undefined)
  assert.equal(createDownloadJobs(video, 1, 'current', paused).length, 0)
  assert.equal(retryDownloadJobs(paused)[0]?.status, 'paused')
  assert.equal(running.status, 'downloading')
})

test('pause and resume invalidate late progress, completion and failure from older runs', () => {
  const running = createJob({ status: 'downloading', runId: 'old-run' })
  assert.equal(canApplyJobUpdate(running, running.runId), true)
  const paused = pauseJob([running], running.id)
  assert.equal(canApplyJobUpdate(paused[0], running.runId), false)
  const resumed = resumeJob(paused, running.id)
  assert.equal(resumed[0]?.status, 'queued')
  assert.equal(canApplyJobUpdate(resumed[0], undefined), false)
  assert.equal(canApplyJobUpdate(resumed[0], running.runId), false)
  assert.equal(getNextQueuedJob(resumed, false)?.id, running.id)
  const reclaimed = { ...running, runId: 'new-run' }
  assert.equal(canApplyJobUpdate(reclaimed, running.runId), false)
  assert.equal(canApplyJobUpdate(reclaimed, reclaimed.runId), true)
  for (const current of [paused[0], resumed[0], reclaimed]) {
    const controller = new AbortController()
    abortStaleJobRun(running, current, controller)
    assert.equal(controller.signal.aborted, true)
    assert.ok(controller.signal.reason instanceof JobPausedError)
    assert.equal(shouldClearAbortedJobCache(controller.signal), false)
  }
})

test('pause before saving rejects the stale transition and saving before pause rejects pause', () => {
  const running = createJob({ status: 'merging', runId: 'first-run' })
  const [paused] = pauseJob([running], running.id)
  const controller = new AbortController()
  let didSave = false
  assert.throws(() => {
    confirmJobUpdate(canApplyJobUpdate(paused, running.runId), controller)
    didSave = true
  }, JobPausedError)
  assert.equal(didSave, false)
  assert.equal(shouldClearAbortedJobCache(controller.signal), false)

  const saving = { ...running, status: 'saving' as const }
  assert.equal(canPauseJob(saving), false)
  assert.throws(() => pauseJob([saving], saving.id), /文件正在保存/)
  assert.equal(canApplyJobUpdate(saving, running.runId), true)
  assert.equal(saving.status, 'saving')
})

test('delayed snapshots from before a new claim cannot pause that new run', () => {
  const claimed = createJob({ status: 'resolving', runId: 'new-run' })
  const oldRunning = { ...claimed, runId: 'old-run' }
  const [oldPaused] = pauseJob([oldRunning], claimed.id)
  assert.ok(oldPaused)
  const [oldQueued] = resumeJob([oldPaused], claimed.id)
  const controller = new AbortController()
  abortChangedJobRun(claimed, oldRunning, oldPaused, controller)
  abortChangedJobRun(claimed, oldPaused, oldQueued, controller)
  assert.equal(controller.signal.aborted, false)
  const [paused] = pauseJob([claimed], claimed.id)
  abortChangedJobRun(claimed, claimed, paused, controller)
  assert.equal(controller.signal.aborted, true)
  assert.equal(shouldClearAbortedJobCache(controller.signal), false)
})

test('moving waiting jobs changes claim order without moving active or paused jobs and history', () => {
  const running = createJob({ id: 'running', status: 'downloading' })
  const first = createJob({ id: 'first' })
  const paused = createJob({ id: 'paused', status: 'paused' })
  const completed = createJob({ id: 'completed', status: 'completed' })
  const second = createJob({ id: 'second' })
  const third = createJob({ id: 'third' })
  const jobs = [running, first, paused, completed, second, third]
  const moved = moveQueuedJob(jobs, second.id, 'up')
  assert.deepEqual(
    moved.map(job => job.id),
    ['running', 'second', 'paused', 'completed', 'first', 'third'],
  )
  assert.equal(getNextQueuedJob(moved, false), undefined)
  assert.equal(getNextQueuedJob(moved.slice(1), false)?.id, second.id)
  assert.deepEqual(moveQueuedJob(moved, second.id, 'down'), jobs)
  assert.deepEqual(moveQueuedJob(jobs, first.id, 'up'), jobs)
  assert.deepEqual(moveQueuedJob(jobs, third.id, 'down'), jobs)
  for (const job of [running, paused, completed]) {
    assert.throws(() => moveQueuedJob(jobs, job.id, 'up'), /只有等待下载/)
  }
})

test('a cancelled or removed task aborts with cache deletion while completion remains valid', () => {
  const running = createJob({ status: 'downloading', runId: 'first-run' })
  for (const current of [
    { ...running, status: 'cancelled' as const },
    undefined,
  ]) {
    const controller = new AbortController()
    abortStaleJobRun(running, current, controller)
    assert.equal(controller.signal.aborted, true)
    assert.equal(shouldClearAbortedJobCache(controller.signal), true)
    assert.equal(canApplyJobUpdate(current, running.runId), false)
  }
  const controller = new AbortController()
  abortStaleJobRun(running, { ...running, status: 'completed' }, controller)
  assert.equal(controller.signal.aborted, false)
  assert.equal(shouldClearAbortedJobCache(controller.signal), false)
})

test('resumed jobs keep their cache identity and pause cannot revive a terminal or native job', () => {
  const waiting = createJob({ receivedBytes: 128, qualityPreference: '720' })
  const paused = pauseJob([waiting], waiting.id)
  const [resumed] = resumeJob(paused, waiting.id)
  assert.equal(resumed?.id, waiting.id)
  assert.equal(resumed?.receivedBytes, 128)
  assert.equal(resumed?.qualityPreference, '720')
  assert.deepEqual(pauseJob(paused, waiting.id), paused)
  for (const status of [
    'completed',
    'failed',
    'cancelled',
    'native',
  ] as const) {
    const job = { ...waiting, status }
    assert.equal(canPauseJob(job), false)
    assert.equal(isJobRunning(job), false)
    assert.throws(() => pauseJob([job], job.id))
    assert.throws(() => resumeJob([job], job.id), /只有已暂停/)
  }
  const native = { ...waiting, status: 'native' as const }
  const next = createJob({ id: 'browser-next', cid: 20 })
  assert.equal(getNextQueuedJob([native, next], false)?.id, next.id)
  assert.equal(isJobActive(native), true)
  assert.throws(() => pauseJob([], waiting.id), /已不存在/)
  assert.throws(() => resumeJob([], waiting.id), /已不存在/)
  assert.throws(() => moveQueuedJob([], waiting.id, 'up'), /已不存在/)
})

test('pausing a transfer aborts its network body and resuming reuses its verified prefix', async () => {
  let state: CachedMediaState | undefined
  let chunks: Uint8Array<ArrayBuffer>[] = []
  const cache: MediaCache = {
    read: async () => state,
    async reset(_key, representation) {
      state = {
        ...representation,
        received: 0,
        complete: false,
        updatedAt: Date.now(),
      }
      chunks = []
    },
    async append(_key, bytes) {
      assert.ok(state)
      chunks.push(bytes.slice())
      state.received += bytes.byteLength
    },
    async setTotal(_key, total) {
      assert.ok(state)
      state.total = total
    },
    async complete() {
      assert.ok(state)
      state.complete = true
    },
    blob: async () => new Blob(chunks),
    retain: async () => {},
    async clear() {
      state = undefined
      chunks = []
    },
  }
  const running = createJob({ status: 'downloading', runId: 'first-run' })
  const controller = new AbortController()
  let queue = [running]
  let networkSignal: AbortSignal | null | undefined
  let bodyCancelled = false
  const input = {
    cache,
    inputKey: 'video-track',
    urls: ['https://cdn.test/video.m4s'],
    maxBytes: 10,
  }
  await assert.rejects(
    fetchCachedMedia({
      ...input,
      signal: controller.signal,
      onProgress(received) {
        if (received === 2) {
          queue = pauseJob(queue, running.id)
          abortStaleJobRun(running, queue[0], controller)
        }
      },
      async fetcher(_url, init) {
        networkSignal = init?.signal
        return new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(new Uint8Array([1, 2]))
            },
            cancel() {
              bodyCancelled = true
            },
          }),
          { headers: { etag: '"v1"', 'content-length': '5' } },
        )
      },
    }).finally(() => {
      if (shouldClearAbortedJobCache(controller.signal)) {
        return cache.clear()
      }
    }),
    JobPausedError,
  )
  assert.equal(networkSignal?.aborted, true)
  assert.equal(bodyCancelled, true)
  assert.equal(state?.received, 2)
  assert.equal(state?.complete, false)
  queue = resumeJob(queue, running.id)
  assert.equal(getNextQueuedJob(queue, false)?.id, running.id)
  const blob = await fetchCachedMedia({
    ...input,
    signal: new AbortController().signal,
    onProgress: () => {},
    async fetcher(_url, init) {
      const headers = new Headers(init?.headers)
      assert.equal(headers.get('range'), 'bytes=2-')
      assert.equal(headers.get('if-range'), '"v1"')
      return new Response(new Uint8Array([3, 4, 5]), {
        status: 206,
        headers: {
          'content-range': 'bytes 2-4/5',
          'content-length': '3',
          etag: '"v1"',
        },
      })
    },
  })
  assert.deepEqual(
    [...new Uint8Array(await blob.arrayBuffer())],
    [1, 2, 3, 4, 5],
  )
})
