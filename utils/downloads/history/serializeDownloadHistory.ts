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
      'BV 号',
      'CID',
      '标题',
      'UP 主',
      '页码',
      '分 P',
      '类型',
      '状态',
      '画质或素材说明',
      '请求保存路径',
      '创建时间（UTC）',
    ],
    ...records.map(record => Object.values(record)),
  ]
    .map(row => row.map(escapeCsvCell).join(','))
    .join('\r\n')}`
}
