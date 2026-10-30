import { i18n } from '~/utils/i18n'
import { DOWNLOAD_KIND_LABELS, STATUS_LABELS } from '../labels'
import type { DownloadJob } from '~/types/download'

/**
 * Export only user-facing metadata, excluding CDN URLs and browser internals.
 *
 * @param jobs - Queue jobs or compatible library records to export in their
 * current order.
 * @param format - json for a versioned records envelope, or csv for a UTF-8
 * BOM and header row.
 * @returns Serialized visible metadata; CSV cells are quoted and protected
 * against spreadsheet formula execution.
 * @throws {RangeError} If a createdAt timestamp cannot be represented as an
 *   ISO date.
 */
export function serializeDownloadHistory(
  jobs: DownloadJob[],
  format: 'json' | 'csv',
): string {
  const records = jobs.map(job => ({
    bvid: job.bvid,
    cid: job.cid,
    title: job.title,
    owner: job.owner,
    page: job.page,
    part: job.part,
    kind: DOWNLOAD_KIND_LABELS[job.kind],
    status: STATUS_LABELS[job.status],
    quality: job.quality || '',
    filename: job.filename || '',
    createdAt: new Date(job.createdAt).toISOString(),
  }))
  if (format === 'json') {
    return JSON.stringify({ version: 1, records }, null, 2)
  }
  const escapeCsvCell = (value: string | number) => {
    const text = String(value)
    // Prevent spreadsheet formula execution even behind leading whitespace.
    const safe =
      /^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }
  return `\u{FEFF}${[
    [
      i18n.t('downloadFileSettings.bvId'),
      'CID',
      i18n.t('downloadFileSettings.title'),
      i18n.t('downloadQueueItem.uploader'),
      i18n.t('downloadFileSettings.partNumber'),
      i18n.t('serializeDownloadHistory.part'),
      i18n.t('downloadFileSettings.type'),
      i18n.t('serializeDownloadHistory.status'),
      i18n.t('serializeDownloadHistory.qualityOrAssetDescription'),
      i18n.t('serializeDownloadHistory.requestedSavePath'),
      i18n.t('serializeDownloadHistory.createdTimeUtc'),
    ],
    ...records.map(record => Object.values(record)),
  ]
    .map(row => row.map(escapeCsvCell).join(','))
    .join('\r\n')}`
}
