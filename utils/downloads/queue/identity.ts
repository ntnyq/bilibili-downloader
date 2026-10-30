import type { DownloadJob } from '~/types/download'

/**
 * Builds the stable asset identity used for queue deduplication and download
 * history.
 *
 * @param job - BV/CID, asset kind, and subtitle language; quality and
 * execution IDs do not affect identity.
 * @returns A video-wide cover key, or a part/kind key with language appended
 * for subtitles.
 */
export function getJobIdentity(
  job: Pick<DownloadJob, 'bvid' | 'cid' | 'kind' | 'subtitleLanguage'>,
): string {
  if (job.kind === 'cover') {
    return `${job.bvid}:cover`
  }
  return `${job.bvid}:${job.cid}:${job.kind}${job.kind === 'subtitle' ? `:${job.subtitleLanguage}` : ''}`
}
