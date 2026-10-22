import assert from 'node:assert/strict'
import { test } from 'node:test'
import { downloadHistoryRecordSchema } from '../../types/downloadHistory'
import { groupHistoryRecords } from '../../utils/downloads/historyGroups'

function createRecord(id: string, completedAt?: number) {
  return downloadHistoryRecordSchema.parse({
    id,
    identity: id,
    bvid: 'BV1xx411c7mD',
    cid: 1,
    page: 1,
    part: '正片',
    title: '示例视频',
    owner: '示例 UP',
    cover: '',
    duration: 60,
    pageCount: 1,
    createdAt: new Date(2026, 9, 13).getTime(),
    completedAt,
    status: 'completed',
    qualityPreference: 'best',
    progress: 100,
    receivedBytes: 0,
    totalBytes: 0,
  })
}

test('history groups use calendar days across year boundaries and preserve record order', () => {
  const now = new Date(2026, 0, 1, 0, 10)
  const records = [
    createRecord('today', new Date(2026, 0, 1, 0, 5).getTime()),
    createRecord('yesterday-1', new Date(2025, 11, 31, 23, 55).getTime()),
    createRecord('yesterday-2', new Date(2025, 11, 31, 0, 5).getTime()),
    createRecord('older', new Date(2025, 11, 30).getTime()),
  ]
  const snapshot = structuredClone(records)
  const groups = groupHistoryRecords(records, now)
  assert.deepEqual(
    groups.map(group => group.label),
    ['今天', '昨天', '2025年12月30日'],
  )
  assert.deepEqual(
    groups[1]?.records.map(record => record.id),
    ['yesterday-1', 'yesterday-2'],
  )
  assert.deepEqual(records, snapshot)
})

test('legacy records never claim a completion day, and timestamp zero remains a real date', () => {
  const groups = groupHistoryRecords(
    [
      createRecord('legacy'),
      createRecord('epoch', 0),
      createRecord('legacy-2'),
    ],
    new Date(2026, 9, 13),
  )
  assert.equal(groups[0]?.label, '旧记录 · 完成时间未知')
  assert.equal(groups[0]?.records.length, 2)
  assert.notEqual(groups[1]?.key, 'legacy')
  assert.deepEqual(groupHistoryRecords([]), [])
})
