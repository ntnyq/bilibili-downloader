import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { downloadJobSchema, downloadJobsSchema } from '../../types/download'
import { downloadLibrarySchema } from '../../types/downloadHistory'
import { installExtension } from '../support/extension'

const { sendDownloadMessage } = await import('../../utils/downloads/messages')

function createJob() {
  return downloadJobSchema.parse({
    id: 'job',
    bvid: 'BV1xx411c7mD',
    cid: 1,
    page: 1,
    part: 'P1',
    duration: 1,
    title: 'Test video',
    cover: '',
    pageCount: 1,
    createdAt: 1,
    status: 'queued',
    progress: 0,
    receivedBytes: 0,
    totalBytes: 0,
  })
}

test('invalid API metadata cannot poison an existing queue', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')
  registerDownloads()
  const before = [createJob()]
  extension.stored.downloadJobs = before
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      code: 0,
      data: {
        bvid: 'invalid',
        title: 'Test video',
        pic: '',
        owner: { name: 'Uploader' },
        pages: [{ cid: 1, page: 1, part: 'P1', duration: 1 }],
      },
    }),
  )
  await assert.rejects(
    sendDownloadMessage(
      {
        type: 'queue.add',
        videoId: 'BV1xx411c7mD',
        page: 1,
        mode: 'current',
        quality: 'best',
        kind: 'video',
        subtitleLanguage: 'auto',
      },
      z.unknown(),
    ),
  )
  assert.deepEqual(
    await sendDownloadMessage({ type: 'queue.list' }, downloadJobsSchema),
    before,
  )
  await sendDownloadMessage({ type: 'queue.clear' }, z.null())
})

test('queue recovery preserves the original snapshot and keeps valid jobs', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')
  registerDownloads()
  const job = createJob()
  const corrupt = [job, { ...job, id: 'broken', bvid: 'invalid' }]
  extension.stored.downloadJobs = structuredClone(corrupt)
  await sendDownloadMessage({ type: 'library.clear' }, z.null())
  await sendDownloadMessage({ type: 'runner.open' }, z.null())
  await sendDownloadMessage({ type: 'queue.recover' }, z.null())
  assert.deepEqual(
    await sendDownloadMessage({ type: 'queue.list' }, downloadJobsSchema),
    [job],
  )
  assert.deepEqual(extension.stored.downloadJobsRecoveryBackup, corrupt)
})

test('repeated queue recovery retains every original snapshot', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')
  registerDownloads()
  const first = [createJob(), { id: 'first broken job' }]
  const second = [createJob(), { id: 'second broken job' }]
  for (const snapshot of [first, second]) {
    extension.stored.downloadJobs = structuredClone(snapshot)
    await sendDownloadMessage({ type: 'queue.recover' }, z.null())
  }
  const backups = Object.entries(extension.stored)
    .filter(([key]) => key.startsWith('downloadJobsRecoveryBackup'))
    .map(([, value]) => value)
  assert.ok(
    backups.some(value => JSON.stringify(value) === JSON.stringify(first)),
  )
  assert.ok(
    backups.some(value => JSON.stringify(value) === JSON.stringify(second)),
  )
  assert.deepEqual(
    await sendDownloadMessage({ type: 'queue.list' }, downloadJobsSchema),
    [createJob()],
  )
})

test('queue recovery persists its backup before changing the queue', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')
  registerDownloads()
  const corrupt = [createJob(), { id: 'broken' }]
  extension.stored.downloadJobs = structuredClone(corrupt)
  const set = extension.local.set.bind(extension.local)
  let failure = 'backup'
  context.mock.method(
    extension.local,
    'set',
    async (values: Record<string, unknown>) => {
      if (failure === 'backup') {
        throw new Error('Backup write failed')
      }
      if ('downloadJobs' in values) {
        assert.deepEqual(extension.stored.downloadJobsRecoveryBackup, corrupt)
        if (failure === 'queue') {
          throw new Error('Queue write failed')
        }
      }
      await set(values)
    },
  )
  await assert.rejects(
    sendDownloadMessage({ type: 'queue.recover' }, z.null()),
    /Backup write failed/,
  )
  assert.deepEqual(extension.stored.downloadJobs, corrupt)
  failure = 'queue'
  await assert.rejects(
    sendDownloadMessage({ type: 'queue.recover' }, z.null()),
    /Queue write failed/,
  )
  assert.deepEqual(extension.stored.downloadJobs, corrupt)
  assert.deepEqual(extension.stored.downloadJobsRecoveryBackup, corrupt)
  failure = ''
  await sendDownloadMessage({ type: 'queue.recover' }, z.null())
  assert.deepEqual(
    await sendDownloadMessage({ type: 'queue.list' }, downloadJobsSchema),
    [createJob()],
  )
  assert.equal(
    Object.keys(extension.stored).filter(key =>
      key.startsWith('downloadJobsRecoveryBackup'),
    ).length,
    1,
  )
})

for (const kind of ['browser', 'native'] as const) {
  test(`${kind} completion survives a history storage failure`, async context => {
    const extension = installExtension(context)
    const { registerDownloads } =
      await import('../../entrypoints/background/services/downloads')
    registerDownloads()
    const runId = crypto.randomUUID()
    const history = { version: 1, records: [] }
    extension.stored.downloadRunnerTabId = 1
    extension.stored.downloadJobs = [
      {
        ...createJob(),
        runId,
        status: kind === 'browser' ? 'saving' : 'native',
      },
    ]
    extension.stored.downloadLibrary = structuredClone(history)
    const set = extension.local.set.bind(extension.local)
    context.mock.method(
      extension.local,
      'set',
      async (values: Record<string, unknown>) => {
        if ('downloadLibrary' in values) {
          throw new Error('History quota exceeded')
        }
        await set(values)
      },
    )
    assert.equal(
      await sendDownloadMessage(
        {
          type: kind === 'browser' ? 'runner.update' : 'native.update',
          id: 'job',
          runId,
          update: {
            status: 'completed',
            progress: 100,
            filename: 'Bilibili/test.mp4',
          },
        },
        z.boolean(),
      ),
      true,
    )
    const [job] = await sendDownloadMessage(
      { type: 'queue.list' },
      downloadJobsSchema,
    )
    assert.equal(job?.status, 'completed')
    assert.equal(job?.filename, 'Bilibili/test.mp4')
    assert.match(job?.error ?? '', /已保存.*历史.*History quota exceeded/)
    assert.deepEqual(extension.stored.downloadLibrary, history)
  })
}

test('completion does not acknowledge a failed queue write', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')
  registerDownloads()
  const runId = crypto.randomUUID()
  const before = [{ ...createJob(), runId, status: 'saving' }]
  extension.stored.downloadRunnerTabId = 1
  extension.stored.downloadJobs = structuredClone(before)
  context.mock.method(extension.local, 'set', async () => {
    throw new Error('Queue storage unavailable')
  })
  await assert.rejects(
    sendDownloadMessage(
      {
        type: 'runner.update',
        id: 'job',
        runId,
        update: { status: 'completed', progress: 100 },
      },
      z.boolean(),
    ),
    /Queue storage unavailable/,
  )
  assert.deepEqual(extension.stored.downloadJobs, before)
})

for (const action of ['pause', 'cancel'] as const) {
  test(`delayed runner retries cannot overwrite ${action} or a replacement run`, async context => {
    const extension = installExtension(context)
    const { registerDownloads } =
      await import('../../entrypoints/background/services/downloads')
    registerDownloads()
    extension.stored.downloadRunnerTabId = 1
    extension.stored.downloadJobs = [createJob()]
    const runId = crypto.randomUUID()
    const claim = { type: 'runner.claim', runId } as const
    const first = await sendDownloadMessage(claim, downloadJobSchema)
    assert.deepEqual(await sendDownloadMessage(claim, downloadJobSchema), first)
    await sendDownloadMessage(
      { type: action === 'pause' ? 'queue.pause' : 'queue.cancel', id: 'job' },
      z.null(),
    )
    const staleUpdate = {
      type: 'runner.update',
      id: 'job',
      runId,
      update: { status: 'completed', progress: 100 },
    } as const
    assert.equal(await sendDownloadMessage(staleUpdate, z.boolean()), false)
    if (action === 'cancel') {
      assert.equal(
        await sendDownloadMessage(claim, downloadJobSchema.nullable()),
        null,
      )
    }
    await sendDownloadMessage(
      { type: action === 'pause' ? 'queue.resume' : 'queue.retry', id: 'job' },
      z.null(),
    )
    const replacement = await sendDownloadMessage(
      { type: 'runner.claim', runId: crypto.randomUUID() },
      downloadJobSchema,
    )
    assert.equal(await sendDownloadMessage(staleUpdate, z.boolean()), false)
    assert.deepEqual(
      await sendDownloadMessage({ type: 'queue.list' }, downloadJobsSchema),
      [replacement],
    )
  })
}

for (const kind of ['browser', 'native'] as const) {
  test(`${kind} completion survives a corrupt history library`, async context => {
    const extension = installExtension(context)
    const { registerDownloads } =
      await import('../../entrypoints/background/services/downloads')
    registerDownloads()
    const runId = crypto.randomUUID()
    extension.stored.downloadRunnerTabId = 1
    extension.stored.downloadJobs = [
      {
        ...createJob(),
        runId,
        status: kind === 'browser' ? 'saving' : 'native',
      },
    ]
    const corrupt = { version: 999, records: [] }
    extension.stored.downloadLibrary = corrupt
    await sendDownloadMessage(
      {
        type: kind === 'browser' ? 'runner.update' : 'native.update',
        id: 'job',
        runId,
        update: {
          status: 'completed',
          progress: 100,
          filename: 'Bilibili/test.mp4',
        },
      },
      z.boolean(),
    )
    const [job] = await sendDownloadMessage(
      { type: 'queue.list' },
      downloadJobsSchema,
    )
    assert.equal(job?.status, 'completed')
    assert.equal(job?.filename, 'Bilibili/test.mp4')
    assert.match(job?.error ?? '', /已保存.*历史/)
    assert.deepEqual(extension.stored.downloadLibrary, corrupt)
    await sendDownloadMessage({ type: 'library.clear' }, z.null())
    const library = await sendDownloadMessage(
      { type: 'library.list' },
      downloadLibrarySchema,
    )
    assert.equal(library.records.length, 0)
  })
}
