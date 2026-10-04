import { downloadJobSchema, jobUpdateSchema } from '../../types/download'
import { jobIdentity } from './assets'
import { isJobActive, MAX_PENDING_JOBS } from './model'
import type { DownloadJob, JobUpdate } from '../../types/download'

/**
 * Transfer an idle media task exclusively to a native execution lease.
 */
export function startNativeJob(jobs: DownloadJob[], id: string): DownloadJob {
  const job = jobs.find(item => item.id === id)
  if (
    !job
    || !['video', 'audio'].includes(job.kind)
    || !['paused', 'failed', 'cancelled', 'completed'].includes(job.status)
  ) {
    throw new Error('请先暂停音视频任务，再交给本地助手。')
  }
  const active = jobs.filter(item => item.id !== id && isJobActive(item))
  if (active.some(item => jobIdentity(item) === jobIdentity(job))) {
    throw new Error('此素材已有其他下载任务，请先取消重复任务。')
  }
  if (active.length >= MAX_PENDING_JOBS) {
    throw new Error('下载队列已满，请等待部分任务完成。')
  }
  return {
    ...job,
    status: 'native',
    runId: crypto.randomUUID(),
    progress: 0,
    receivedBytes: 0,
    totalBytes: 0,
    downloadId: undefined,
    filename: undefined,
    error: undefined,
    quality: undefined,
  }
}

/**
 * A revoked lease can never overwrite cancellation or a subsequent execution.
 */
export function applyNativeUpdate(
  job: DownloadJob,
  runId: string,
  update: JobUpdate,
): boolean {
  if (job.status !== 'native' || job.runId !== runId) {
    return false
  }
  // Structured-clone messaging preserves explicit undefined properties.
  // Missing progress fields must not erase required values in the stored job.
  const patch = jobUpdateSchema.parse(
    Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== undefined),
    ),
  )
  if (patch.status === 'completed' && !patch.filename) {
    throw new Error('本地助手未返回保存路径，无法确认完成。')
  }
  const next = downloadJobSchema.parse({
    ...job,
    ...patch,
    ...(patch.status === 'completed' ? { progress: 100 } : {}),
  })
  Object.assign(job, next)
  return true
}
