import type { DownloadJob } from '~/types/download'

export function getDownloadPageUrl(
  job: Pick<DownloadJob, 'bvid' | 'page' | 'epId'>,
): string {
  return job.epId === undefined
    ? `https://www.bilibili.com/video/${job.bvid}/?p=${job.page}`
    : `https://www.bilibili.com/bangumi/play/ep${job.epId}`
}
