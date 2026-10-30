import { i18n } from '~/utils/i18n'
import type { DownloadHistoryRecord } from '~/types/downloadHistory'

interface HistoryGroup {
  key: string
  label: string
  records: DownloadHistoryRecord[]
}

/**
 * Builds a local-calendar grouping key without applying UTC conversion.
 *
 * @param date - Date whose local year, zero-based month, and day define the
 * group.
 * @returns A year-month-day key using the local calendar and a zero-based
 * month.
 */
function getLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/**
 * Group the current page by local calendar day without inventing completion
 * dates.
 *
 * @param records - Current page of history records, already ordered as the
 * caller wants them displayed.
 * @param now - Local reference date for today/yesterday labels; defaults to a
 * new Date().
 * @returns Groups in first-seen order, preserving record order and placing
 * unknown completion dates in a legacy group.
 */
export function groupHistoryRecords(
  records: DownloadHistoryRecord[],
  now = new Date(),
): HistoryGroup[] {
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const todayKey = getLocalDateKey(now)
  const yesterdayKey = getLocalDateKey(yesterday)
  const groups = new Map<string, HistoryGroup>()
  for (const record of records) {
    const date =
      record.completedAt === undefined
        ? undefined
        : new Date(record.completedAt)
    const key = date ? getLocalDateKey(date) : 'legacy'
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        label: date
          ? key === todayKey
            ? i18n.t('groupHistoryRecords.today')
            : key === yesterdayKey
              ? i18n.t('groupHistoryRecords.yesterday')
              : date.toLocaleDateString(i18n.t('localeCode'), {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
          : i18n.t('groupHistoryRecords.legacyRecordsCompletionTimeUnknown'),
        records: [],
      }
      groups.set(key, group)
    }
    group.records.push(record)
  }
  return [...groups.values()]
}
