import { i18n } from '~/utils/i18n'
import type { DownloadJob } from '~/types/download'

/**
 * Checks whether a job currently owns a browser execution phase.
 *
 * @param job - Queue job whose current status is inspected.
 * @returns Whether status is resolving, downloading, merging, or saving;
 * native execution is excluded.
 */
export function isJobRunning(job: DownloadJob): boolean {
  return ['resolving', 'downloading', 'merging', 'saving'].includes(job.status)
}

/**
 * Checks whether a browser job may transition to paused.
 *
 * @param job - Queue job whose status determines pause availability.
 * @returns Whether status is queued, resolving, downloading, or merging;
 * saving and terminal/native jobs cannot pause.
 */
export function canPauseJob(job: DownloadJob): boolean {
  return ['queued', 'resolving', 'downloading', 'merging'].includes(job.status)
}

/**
 * Only a claimed run may report progress, including after a quick
 * pause/resume.
 *
 * @param job - Current queue job, or undefined when it has been removed.
 * @param runId - Execution lease submitted with the browser-runner update.
 * @returns Whether both IDs exist, the lease matches, and the job is still in
 * a browser-running phase.
 */
export function canApplyJobUpdate(
  job: DownloadJob | undefined,
  runId: string | undefined,
): boolean {
  return !!job && !!runId && job.runId === runId && isJobRunning(job)
}

/**
 * Finds a queue job by ID or reports that it has been removed.
 *
 * @param jobs - Current queue to search.
 * @param id - Job ID required by a queue-control action.
 * @returns The matching job object from the queue.
 * @throws {Error} If no job has the requested ID.
 */
function requireJob(jobs: DownloadJob[], id: string): DownloadJob {
  const job = jobs.find(item => item.id === id)
  if (!job) {
    throw new Error(i18n.t('control.thisTaskNoLongerExistsRefreshTheList'))
  }
  return job
}

/**
 * Pauses an eligible job and revokes its browser execution lease.
 *
 * @param jobs - Current queue snapshot, which is not mutated.
 * @param id - ID of the job to pause.
 * @returns A queue with the target paused and runId cleared, or the original
 * queue if it was already paused.
 * @throws {Error} If the job is missing, saving a file, or in a status that
 *   cannot pause.
 */
export function pauseJob(jobs: DownloadJob[], id: string): DownloadJob[] {
  const job = requireJob(jobs, id)
  if (job.status === 'paused') {
    return jobs
  }
  if (job.status === 'saving') {
    throw new Error(i18n.t('control.theFileIsBeingSavedAndCannotBe'))
  }
  if (!canPauseJob(job)) {
    throw new Error(i18n.t('control.thisTaskHasEndedAndCannotBePaused'))
  }
  return jobs.map(item =>
    item.id === id ? { ...item, status: 'paused', runId: undefined } : item,
  )
}

/**
 * Requeues a paused job while retaining its progress and cache identity.
 *
 * @param jobs - Current queue snapshot, which is not mutated.
 * @param id - ID of the paused job to continue.
 * @returns A copied queue with the target queued and its old lease, error,
 * browser download ID, and filename cleared.
 * @throws {Error} If the job is missing or is not paused.
 */
export function resumeJob(jobs: DownloadJob[], id: string): DownloadJob[] {
  const job = requireJob(jobs, id)
  if (job.status !== 'paused') {
    throw new Error(i18n.t('control.onlyPausedTasksCanBeResumed'))
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
 *
 * @param jobs - Current queue snapshot, preserving running, paused, and
 * history positions.
 * @param id - ID of a queued job to move.
 * @param direction - up or down among queued-job slots only.
 * @returns A queue with the target swapped with its queued neighbor, or the
 * original queue at either boundary.
 * @throws {Error} If the job is missing or is not queued.
 */
export function moveQueuedJob(
  jobs: DownloadJob[],
  id: string,
  direction: 'up' | 'down',
): DownloadJob[] {
  const job = requireJob(jobs, id)
  if (job.status !== 'queued') {
    throw new Error(i18n.t('control.onlyWaitingTasksCanBeReordered'))
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
 *
 * Returns no value when the update is accepted and the execution signal
 * remains active.
 *
 * @param accepted - Whether the background accepted the runner state
 * transition.
 * @param controller - Execution controller to abort when the lease/state
 * transition was rejected.
 * @throws {JobPausedError} If a rejected update aborts an execution that was
 *   still active.
 * @throws The existing signal abort reason if execution was already cancelled
 *   or paused.
 */
export function confirmJobUpdate(
  accepted: boolean,
  controller: AbortController,
) {
  if (!accepted) {
    controller.abort(
      new JobPausedError(
        i18n.t('control.theTaskStateChangedThisExecutionStopped'),
      ),
    )
  }
  controller.signal.throwIfAborted()
}

/**
 * Keep paused runs aborted even when a resume already changed them to queued.
 *
 * Returns no value; the controller signal records cancellation or a
 * JobPausedError reason when the claimed run is stale.
 *
 * @param claimed - Job snapshot whose runId was claimed by this browser
 * execution.
 * @param current - Latest queue job, or undefined if removed.
 * @param controller - Execution controller aborted for removal/cancellation or
 * a paused/replaced lease.
 */
export function abortStaleJobRun(
  claimed: DownloadJob,
  current: DownloadJob | undefined,
  controller: AbortController,
) {
  if (!current || current.status === 'cancelled') {
    controller.abort()
  } else if (current.status === 'paused' || current.runId !== claimed.runId) {
    controller.abort(
      new JobPausedError(i18n.t('control.theTaskWasPausedOrTakenOverBy')),
    )
  }
}

/**
 * A delayed storage event from before this claim must not abort the new run.
 *
 * Returns no value; relevant stale changes abort the execution, while
 * unrelated delayed storage events are ignored.
 *
 * @param claimed - Job snapshot originally claimed by this browser execution.
 * @param previous - Old job value from a storage change, when available.
 * @param current - New job value from the same change, or undefined after
 * removal.
 * @param controller - Controller updated only if the event references this
 * claimed execution lease.
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

/**
 * Distinguishes cancellation cleanup from pause/replacement that should retain
 * resumable bytes.
 *
 * @param signal - Browser execution signal containing the abort state and
 * reason.
 * @returns True for aborted executions except those carrying JobPausedError;
 * false for active or paused executions.
 */
export function shouldClearAbortedJobCache(signal: AbortSignal): boolean {
  return signal.aborted && !(signal.reason instanceof JobPausedError)
}
