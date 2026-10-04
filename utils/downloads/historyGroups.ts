import type { DownloadHistoryRecord } from '../../types/downloadHistory'

interface HistoryGroup {
  key: string
  label: string
  records: DownloadHistoryRecord[]
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/**
 * Group the current page by local calendar day without inventing completion dates.
 */
export function groupHistoryRecords(
  records: DownloadHistoryRecord[],
  now = new Date(),
): HistoryGroup[] {
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const todayKey = dateKey(now)
  const yesterdayKey = dateKey(yesterday)
  const groups = new Map<string, HistoryGroup>()
  for (const record of records) {
    const date =
      record.completedAt === undefined
        ? undefined
        : new Date(record.completedAt)
    const key = date ? dateKey(date) : 'legacy'
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        label: date
          ? key === todayKey
            ? '今天'
            : key === yesterdayKey
              ? '昨天'
              : date.toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
          : '旧记录 · 完成时间未知',
        records: [],
      }
      groups.set(key, group)
    }
    group.records.push(record)
  }
  return [...groups.values()]
}
