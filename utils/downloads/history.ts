import { DOWNLOAD_KIND_LABELS } from './assets'
import { STATUS_LABELS } from './model'
import type { DownloadJob } from '../../types/download'

/**
 * Export only user-facing metadata, excluding CDN URLs and browser internals.
 */
export function exportHistory(
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
  const quote = (value: string | number) => {
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
    .map(row => row.map(quote).join(','))
    .join('\r\n')}`
}
