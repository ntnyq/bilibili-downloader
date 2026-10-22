import assert from 'node:assert/strict'
import { test } from 'node:test'
import { batchSessionDataSchema } from '../../types/batchSession'
import {
  commitBatchSessionResult,
  createBatchSessionData,
  findBatchSessionVideoReceipt,
  getBatchSessionRow,
  restoreBatchSession,
  saveBatchSession,
} from '../../utils/downloads/batchSession'
import type { BatchImportRow, BatchSession } from '../../types/batchSession'

function createRow(page = 1, videoId = 'BV1xx411c7mD'): BatchImportRow {
  return {
    key: `${videoId}:${page}`,
    item: { videoId, title: `视频 P${page}`, page },
    selected: true,
    status: 'pending',
    outcome: '',
  }
}

function createSession(): BatchSession {
  const data = createBatchSessionData()
  data.drafts = {
    links: 'BV1xx411c7mD',
    favorites: '123',
    collection: 'https://space.bilibili.com/123/lists/456?type=season',
    uploads: '789',
  }
  data.sourceKind = 'favorites'
  data.source = { kind: 'favorites', id: '123' }
  data.nextPage = 3
  data.total = 100
  data.title = '收藏夹'
  data.hasPreview = true
  data.rows = [createRow(), createRow(2)]
  data.options = {
    ...data.options,
    skipCompleted: false,
    quality: '720',
    filenameTemplate: '{owner}_{title}_{page}',
    folderMode: 'owner-video',
  }
  data.optionsSnapshot = { ...data.options }
  const result = saveBatchSession(null, data, null, 100)
  assert.ok(result.session)
  return result.session
}

function createRequest(session: BatchSession, index = 0) {
  const row = session.rows[index]
  assert.ok(row)
  assert.ok(session.optionsSnapshot)
  return {
    sessionId: session.id,
    rowKey: row.key,
    expectedRevision: session.revision,
    item: row.item,
    ...session.optionsSnapshot,
  }
}

test('restores drafts, source, pagination, selection and snapshot without resuming work', () => {
  const session = createSession()
  const first = session.rows[0]
  const second = session.rows[1]
  assert.ok(first)
  assert.ok(second)
  first.status = 'adding'
  second.selected = false
  const before = structuredClone(session)
  const restored = restoreBatchSession(session)
  assert.deepEqual(restored.drafts, session.drafts)
  assert.deepEqual(restored.source, session.source)
  assert.equal(restored.nextPage, 3)
  assert.equal(restored.total, 100)
  assert.equal(restored.rows[0]?.status, 'pending')
  assert.equal(restored.rows[0]?.selected, true)
  assert.equal(restored.rows[1]?.selected, false)
  assert.match(restored.rows[0]?.outcome || '', /手动继续/)
  assert.deepEqual(restored.optionsSnapshot, session.optionsSnapshot)
  assert.deepEqual(session, before)
})

test('compare-and-swap rejects a stale tab and a new preview invalidates old requests', () => {
  const session = createSession()
  const before = structuredClone(session)
  const first = saveBatchSession(
    session,
    { ...session, title: '已更新' },
    session.revision,
    200,
  )
  assert.ok(first.session)
  assert.equal(first.session.revision, 2)
  const conflict = saveBatchSession(
    first.session,
    { ...session, title: '旧页面' },
    session.revision,
  )
  assert.equal(conflict.conflict, true)
  assert.deepEqual(conflict.session, first.session)
  const replacement = saveBatchSession(
    first.session,
    createBatchSessionData(),
    first.session.revision,
  )
  assert.ok(replacement.session)
  assert.notEqual(replacement.session.id, session.id)
  assert.equal(replacement.session.optionsSnapshot, undefined)
  assert.throws(
    () => getBatchSessionRow(replacement.session, createRequest(session)),
    /会话已被替换/,
  )
  assert.deepEqual(session, before)
})

test('durable receipt is replayed after lost reply even with old revision and completed skipping off', () => {
  const session = createSession()
  const request = createRequest(session)
  assert.equal(request.skipCompleted, false)
  const result = {
    added: 1,
    skipped: 0,
    shouldStop: false,
    bvid: 'BV1xx411c7mD',
  }
  const committed = commitBatchSessionResult(
    session,
    request.rowKey,
    result,
    200,
  )
  assert.equal(committed.revision, session.revision + 1)
  assert.equal(committed.rows[0]?.status, 'done')
  assert.equal(committed.rows[0]?.selected, false)
  assert.deepEqual(getBatchSessionRow(committed, request).receipt, result)
  assert.deepEqual(restoreBatchSession(committed).rows[0]?.receipt, result)
  const second = createRequest(committed, 1)
  assert.throws(
    () =>
      getBatchSessionRow(committed, {
        ...second,
        expectedRevision: session.revision,
      }),
    /其他页面更新/,
  )
})

test('a zero-commit failure can be explicitly selected and retried with the frozen options', () => {
  const session = createSession()
  const request = createRequest(session)
  const failed = commitBatchSessionResult(session, request.rowKey, {
    added: 0,
    skipped: 0,
    shouldStop: true,
    error: '请求中断',
  })
  assert.equal(failed.rows[0]?.status, 'failed')
  assert.equal(failed.rows[0]?.receipt, undefined)
  assert.equal(failed.rows[0]?.selected, false)
  assert.throws(
    () => getBatchSessionRow(failed, createRequest(failed)),
    /选项已变化/,
  )
  const selected = saveBatchSession(
    failed,
    {
      ...failed,
      rows: failed.rows.map(row => ({
        ...row,
        selected: true,
      })),
    },
    failed.revision,
  )
  assert.ok(selected.session)
  assert.equal(
    getBatchSessionRow(selected.session, createRequest(selected.session))
      .status,
    'failed',
  )
})

test('saved snapshots and committed receipts cannot be changed or erased by a client save', () => {
  const session = createSession()
  const request = createRequest(session)
  const committed = commitBatchSessionResult(session, request.rowKey, {
    added: 1,
    skipped: 0,
    shouldStop: false,
  })
  const data = restoreBatchSession(committed)
  data.options.quality = '1080'
  data.optionsSnapshot = undefined
  data.rows = data.rows.map(row => ({
    ...row,
    receipt: undefined,
    selected: true,
    status: 'pending',
  }))
  const saved = saveBatchSession(committed, data, committed.revision)
  assert.ok(saved.session)
  assert.deepEqual(saved.session.options, session.optionsSnapshot)
  assert.deepEqual(saved.session.optionsSnapshot, session.optionsSnapshot)
  assert.deepEqual(saved.session.rows[0], committed.rows[0])
  assert.throws(
    () =>
      saveBatchSession(committed, { ...data, rows: [] }, committed.revision),
    /不能从当前会话移除/,
  )
  assert.throws(
    () => getBatchSessionRow(session, { ...request, quality: '1080' }),
    /选项已变化/,
  )
})

test('all-parts and covers remember completed source aliases across resumes', () => {
  for (const options of [
    { mode: 'all' as const },
    { kind: 'cover' as const },
  ]) {
    const session = createSession()
    session.optionsSnapshot = { ...session.options, ...options }
    session.rows.push(createRow(1, 'av123'))
    const committed = commitBatchSessionResult(session, createRow().key, {
      added: 1,
      skipped: 0,
      shouldStop: false,
      bvid: 'BV1xx411c7mD',
    })
    assert.equal(
      findBatchSessionVideoReceipt(committed, createRow(2).key)?.key,
      createRow().key,
    )
    assert.equal(findBatchSessionVideoReceipt(committed, 'av123:1'), undefined)
    assert.equal(
      findBatchSessionVideoReceipt(committed, 'av123:1', 'BV1xx411c7mD')?.key,
      createRow().key,
    )
  }
  const current = createSession()
  const committed = commitBatchSessionResult(current, createRow().key, {
    added: 1,
    skipped: 0,
    shouldStop: false,
  })
  assert.equal(
    findBatchSessionVideoReceipt(committed, createRow(2).key),
    undefined,
  )
})

test('session budget counts UTF-8 bytes and rejects duplicate or forged row keys', () => {
  const session = createBatchSessionData()
  session.rows = Array.from({ length: 500 }, (_, index) => ({
    ...createRow(index + 1),
    item: { ...createRow(index + 1).item, title: '字'.repeat(1000) },
  }))
  assert.ok(JSON.stringify(session).length < 1024 * 1024)
  assert.throws(() => batchSessionDataSchema.parse(session), /1 MiB/)
  session.rows = [createRow(), createRow()]
  assert.throws(() => batchSessionDataSchema.parse(session), /重复/)
  session.rows = [{ ...createRow(), key: 'forged' }]
  assert.throws(() => batchSessionDataSchema.parse(session), /无效/)
})
