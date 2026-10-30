import { MAX_PENDING_JOBS } from '../constants'
import { isJobActive } from './jobs'
import type { DownloadJob } from '~/types/download'

export const MAX_DOWNLOAD_QUEUE_BYTES = 4 * 1024 * 1024
const ACTIVE_JOB_RESERVED_BYTES = 2048
const encoder = new TextEncoder()

/**
 * Keep completed members while their bundle is still active, including on
 * clear.
 *
 * @param jobs - Queue snapshot containing standalone and bundled jobs.
 * @returns Active jobs plus every stored member of any still-active bundle,
 * preserving queue order.
 */
export function clearFinishedDownloadJobs(jobs: DownloadJob[]): DownloadJob[] {
  const activeBundles = new Set(
    jobs
      .filter(isJobActive)
      .flatMap(job => (job.bundleId ? [job.bundleId] : [])),
  )
  return jobs.filter(
    job =>
      isJobActive(job) || (job.bundleId && activeBundles.has(job.bundleId)),
  )
}

/**
 * New work reserves space for every member of an unfinished bundle, including
 * saved members. Existing over-budget queues can still make progress or
 * cancel.
 *
 * Returns no value when no new active ID is introduced or retained count and
 * storage budgets fit.
 *
 * @param previousJobs - Queue before the proposed change, used to identify
 * newly active job IDs.
 * @param nextJobs - Proposed queue after creation, retry, or resume, including
 * reserved bundle members.
 * @throws {Error} If new active work would exceed MAX_PENDING_JOBS or
 *   MAX_DOWNLOAD_QUEUE_BYTES including growth reserves.
 */
export function assertDownloadQueueCapacity(
  previousJobs: DownloadJob[],
  nextJobs: DownloadJob[],
) {
  const previousActive = new Set(
    previousJobs.filter(isJobActive).map(job => job.id),
  )
  if (!nextJobs.some(job => isJobActive(job) && !previousActive.has(job.id))) {
    return
  }
  const retained = clearFinishedDownloadJobs(nextJobs)
  if (retained.length > MAX_PENDING_JOBS) {
    throw new Error(
      '下载队列已满。素材组合全部结束后会释放名额，请先继续或取消未完成任务。',
    )
  }
  const bytes = encoder.encode(JSON.stringify(retained)).byteLength
  const reserve =
    retained.filter(isJobActive).length * ACTIVE_JOB_RESERVED_BYTES
  if (bytes + reserve > MAX_DOWNLOAD_QUEUE_BYTES) {
    throw new Error('下载队列已达到存储上限，请先完成或取消部分任务后再添加。')
  }
}

/**
 * Evict whole finished bundles instead of truncating their progress records.
 * The history limit may be exceeded by one group to avoid splitting it.
 *
 * @param jobs - Queue snapshot ordered by insertion/recency; active bundle
 * members always survive.
 * @param limit - Target maximum finished-history count; defaults to 100 and
 * may be exceeded by one intact group.
 * @returns A subset preserving original order, active work, and newest whole
 * finished groups that fit the byte budget.
 */
export function pruneDownloadJobs(
  jobs: DownloadJob[],
  limit = 100,
): DownloadJob[] {
  const retained = new Set(clearFinishedDownloadJobs(jobs))
  let retainedBytes = encoder.encode(JSON.stringify([...retained])).byteLength
  const finished = new Map<string, DownloadJob[]>()
  for (const job of jobs) {
    if (retained.has(job)) {
      continue
    }
    const key = job.bundleId ? `bundle:${job.bundleId}` : `job:${job.id}`
    const group = finished.get(key) || []
    group.push(job)
    // Updating insertion order makes the group's newest member its recency.
    finished.delete(key)
    finished.set(key, group)
  }
  let historyCount = 0
  for (const group of [...finished.values()].reverse()) {
    if (historyCount >= limit) {
      break
    }
    const groupBytes = encoder.encode(JSON.stringify(group)).byteLength
    if (retainedBytes + groupBytes > MAX_DOWNLOAD_QUEUE_BYTES) {
      continue
    }
    for (const job of group) {
      retained.add(job)
    }
    historyCount += group.length
    retainedBytes += groupBytes
  }
  return jobs.filter(job => retained.has(job))
}
