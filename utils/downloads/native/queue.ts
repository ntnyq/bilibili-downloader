import { downloadJobSchema, jobUpdateSchema } from '~/types/download'
import { i18n } from '~/utils/i18n'
import { MAX_PENDING_JOBS } from '../constants'
import { getJobIdentity } from '../queue/identity'
import { isJobActive } from '../queue/jobs'
import type { DownloadJob, JobUpdate } from '~/types/download'

/**
 * Transfer an idle media task exclusively to a native execution lease.
 *
 * @param jobs - Current queue, used to locate the job and validate active
 * identities/capacity.
 * @param id - ID of a paused or terminal video/audio job to lease to the
 * native helper.
 * @returns A copied native-status job with a fresh runId and reset progress,
 * without mutating the queue.
 * @throws {Error} If the job is missing/ineligible, another active job has its
 *   asset identity, or capacity is full.
 */
export function startNativeJob(jobs: DownloadJob[], id: string): DownloadJob {
  const job = jobs.find(item => item.id === id)
  if (
    !job
    || !['video', 'audio'].includes(job.kind)
    || !['paused', 'failed', 'cancelled', 'completed'].includes(job.status)
  ) {
    throw new Error(i18n.t('queue.pauseTheVideoOrAudioTaskBeforeSending'))
  }
  const active = jobs.filter(item => item.id !== id && isJobActive(item))
  if (active.some(item => getJobIdentity(item) === getJobIdentity(job))) {
    throw new Error(i18n.t('queue.anotherDownloadTaskExistsForThisAssetCancel'))
  }
  if (active.length >= MAX_PENDING_JOBS) {
    throw new Error(i18n.t('queue.theDownloadQueueIsFullWaitForSome'))
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
 *
 * @param job - Queue job mutated in place only after the entire resulting job
 * passes validation.
 * @param runId - Native execution lease that must match the job current runId.
 * @param update - Progress or terminal patch; explicit undefined fields are
 * ignored.
 * @returns True when the validated patch was applied, or false when the native
 * status/lease is stale.
 * @throws {import('zod').ZodError} If the patch or resulting job is invalid.
 * @throws {Error} If a completed update omits a nonempty saved filename.
 */
export function applyNativeJobUpdate(
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
    throw new Error(i18n.t('queue.theLocalHelperReturnedNoSavePathCompletion'))
  }
  const next = downloadJobSchema.parse({
    ...job,
    ...patch,
    ...(patch.status === 'completed' ? { progress: 100 } : {}),
  })
  Object.assign(job, next)
  return true
}
