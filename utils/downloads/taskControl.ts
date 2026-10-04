import type { DownloadJob } from '../../types/download'

export function isJobRunning(job: DownloadJob): boolean {
  return ['resolving', 'downloading', 'merging', 'saving'].includes(job.status)
}

export function canPauseJob(job: DownloadJob): boolean {
  return ['queued', 'resolving', 'downloading', 'merging'].includes(job.status)
}

/**
 * Only a claimed run may report progress, including after a quick pause/resume.
 */
export function canApplyJobUpdate(
  job: DownloadJob | undefined,
  runId: string | undefined,
): boolean {
  return !!job && !!runId && job.runId === runId && isJobRunning(job)
}

function requireJob(jobs: DownloadJob[], id: string): DownloadJob {
  const job = jobs.find(item => item.id === id)
  if (!job) {
    throw new Error('此任务已不存在，请刷新列表。')
  }
  return job
}

export function pauseJob(jobs: DownloadJob[], id: string): DownloadJob[] {
  const job = requireJob(jobs, id)
  if (job.status === 'paused') {
    return jobs
  }
  if (job.status === 'saving') {
    throw new Error('文件正在保存，无法暂停，请等待保存完成。')
  }
  if (!canPauseJob(job)) {
    throw new Error('此任务已结束，无法暂停。')
  }
  return jobs.map(item =>
    item.id === id ? { ...item, status: 'paused', runId: undefined } : item,
  )
}

export function resumeJob(jobs: DownloadJob[], id: string): DownloadJob[] {
  const job = requireJob(jobs, id)
  if (job.status !== 'paused') {
    throw new Error('只有已暂停的任务可以继续。')
  }
  return jobs.map(item =>
    item.id === id
      ? {
          ...item,
          status: 'queued',
          runId: undefined,
          error: undefined,
          downloadId: undefined,
          filename: undefined,
        }
      : item,
  )
}

/**
 * Move between waiting slots without moving the running task or history.
 */
export function moveQueuedJob(
  jobs: DownloadJob[],
  id: string,
  direction: 'up' | 'down',
): DownloadJob[] {
  const job = requireJob(jobs, id)
  if (job.status !== 'queued') {
    throw new Error('只有等待下载的任务可以调整顺序。')
  }
  const waiting = jobs.filter(item => item.status === 'queued')
  const position = waiting.findIndex(item => item.id === id)
  const neighbor = waiting[position + (direction === 'up' ? -1 : 1)]
  if (!neighbor) {
    return jobs
  }
  return jobs.map(item =>
    item.id === id ? neighbor : item.id === neighbor.id ? job : item,
  )
}

export class JobPausedError extends Error {
  override name = 'JobPausedError'
}

/**
 * A rejected transition must stop before its next side effect, such as saving.
 */
export function confirmJobUpdate(
  accepted: boolean,
  controller: AbortController,
) {
  if (!accepted) {
    controller.abort(new JobPausedError('任务状态已变化，停止本次执行。'))
  }
  controller.signal.throwIfAborted()
}

/**
 * Keep paused runs aborted even when a resume already changed them to queued.
 */
export function abortStaleJobRun(
  claimed: DownloadJob,
  current: DownloadJob | undefined,
  controller: AbortController,
) {
  if (!current || current.status === 'cancelled') {
    controller.abort()
  } else if (current.status === 'paused' || current.runId !== claimed.runId) {
    controller.abort(new JobPausedError('任务已暂停或已由新的执行接管。'))
  }
}

/**
 * A delayed storage event from before this claim must not abort the new run.
 */
export function abortChangedJobRun(
  claimed: DownloadJob,
  previous: DownloadJob | undefined,
  current: DownloadJob | undefined,
  controller: AbortController,
) {
  if (previous?.runId === claimed.runId || current?.runId === claimed.runId) {
    abortStaleJobRun(claimed, current, controller)
  }
}

export function shouldClearAbortedJobCache(signal: AbortSignal): boolean {
  return signal.aborted && !(signal.reason instanceof JobPausedError)
}
