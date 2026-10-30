import assert from 'node:assert/strict'
import { test } from 'node:test'
import { downloadJobsSchema, jobUpdateSchema } from '../../types/download'
import {
  applyNativeJobUpdate,
  startNativeJob,
} from '../../utils/downloads/native/queue'
import { createDownloadJobs } from '../../utils/downloads/queue/jobs'
import type { DownloadJob, VideoInfo } from '../../types/download'

const video: VideoInfo = {
  bvid: 'BV1xx411c7mD',
  title: 'Native transfer',
  owner: 'Test',
  cover: '',
  pages: [{ cid: 1, page: 1, part: 'P1', duration: 2 }],
}

function createPausedJob(): DownloadJob {
  const [job] = createDownloadJobs(video, 1, 'current', [])
  assert.ok(job)
  return {
    ...job,
    status: 'paused',
    downloadId: 3,
    filename: 'old.mp4',
  }
}

test('native transfer acquires an exclusive lease without changing the snapshot', () => {
  const source = createPausedJob()
  const claimed = startNativeJob([source], source.id)
  assert.equal(claimed.status, 'native')
  assert.ok(claimed.runId)
  assert.equal(claimed.qualityPreference, source.qualityPreference)
  assert.equal(claimed.filenameTemplate, source.filenameTemplate)
  assert.equal(claimed.filename, undefined)
  assert.equal(claimed.downloadId, undefined)
  assert.equal(source.status, 'paused')
  assert.throws(() => startNativeJob([claimed], claimed.id), /先暂停/)
  assert.throws(
    () => startNativeJob([{ ...source, status: 'queued' }], source.id),
    /先暂停/,
  )
})

test('native transfer rejects another active task for the same asset', () => {
  const source = createPausedJob()
  assert.throws(
    () => startNativeJob([source, { ...source, id: 'another' }], source.id),
    /其他下载任务/,
  )
  assert.throws(
    () => startNativeJob([{ ...source, kind: 'subtitle' }], source.id),
    /音视频/,
  )
})

test('native completion requires a path and cannot overwrite a revoked lease', () => {
  const source = createPausedJob()
  const job = startNativeJob([source], source.id)
  assert.ok(job.runId)
  assert.equal(
    applyNativeJobUpdate(job, 'stale', { status: 'completed' }),
    false,
  )
  assert.throws(
    () => applyNativeJobUpdate(job, job.runId!, { status: 'completed' }),
    /保存路径/,
  )
  assert.equal(
    applyNativeJobUpdate(job, job.runId, {
      status: 'completed',
      filename: '/downloads/Bilibili/test.mp4',
    }),
    true,
  )
  assert.equal(job.progress, 100)
  assert.equal(
    applyNativeJobUpdate(job, job.runId, { status: 'failed' }),
    false,
  )
  assert.equal(job.status, 'completed')
  job.status = 'cancelled'
  assert.equal(
    applyNativeJobUpdate(job, job.runId, {
      status: 'completed',
      filename: 'x',
    }),
    false,
  )
})

test('structured-clone progress updates preserve required queue fields through completion', () => {
  const source = createPausedJob()
  const job = startNativeJob([source], source.id)
  assert.ok(job.runId)
  const runId = job.runId
  applyNativeJobUpdate(job, runId, { receivedBytes: 4096, quality: 'AAC' })
  // Native merging/saving events carry no byte count; Firefox keeps undefined.
  const update = jobUpdateSchema.parse(
    structuredClone({
      status: 'native',
      receivedBytes: undefined,
      totalBytes: undefined,
      progress: undefined,
      quality: undefined,
    }),
  )
  assert.ok(Object.hasOwn(update, 'receivedBytes'))
  assert.ok(applyNativeJobUpdate(job, runId, update))
  assert.equal(job.receivedBytes, 4096)
  assert.equal(job.quality, 'AAC')
  assert.equal(job.totalBytes, 0)
  assert.equal(job.progress, 0)
  assert.ok(downloadJobsSchema.safeParse(structuredClone([job])).success)
  assert.ok(applyNativeJobUpdate(job, runId, { receivedBytes: 0 }))
  assert.equal(job.receivedBytes, 0)
  assert.ok(
    applyNativeJobUpdate(job, runId, {
      status: 'completed',
      filename: '/downloads/Bilibili/test.mp4',
    }),
  )
  const stored = JSON.stringify([job])
  assert.ok(downloadJobsSchema.safeParse(JSON.parse(stored)).success)
})

test('invalid native patches leave the original job intact', () => {
  const source = createPausedJob()
  const job = startNativeJob([source], source.id)
  assert.ok(job.runId)
  const previous = structuredClone(job)
  assert.throws(() =>
    applyNativeJobUpdate(job, job.runId!, {
      status: 'completed',
      filename: '/downloads/Bilibili/test.mp4',
      receivedBytes: Number.NaN,
    }),
  )
  assert.deepEqual(job, previous)
})
