import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import {
  downloadJobSchema,
  downloadJobsSchema,
  episodeInfoSchema,
} from '../../types/download'
import { downloadLibrarySchema } from '../../types/downloadHistory'
import { getDownloadPageUrl } from '../../utils/downloads/getDownloadPageUrl'
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

test('episode playback gates the shared queue and episode IDs survive history requeue', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  extension.stored.downloadJobs = [createJob()]
  const episodeRequest = { type: 'episode.get', epId: 42 } as const
  const addRequest = {
    type: 'queue.episode.add',
    epId: 42,
    quality: 'best',
  } as const
  let badge = ''
  let playback: object = { play_check: { play_detail: 'PLAY_PREVIEW' } }

  context.mock.method(
    globalThis,
    'fetch',
    async (input: string, init?: RequestInit) => {
      const url = new URL(input)

      assert.equal(init?.credentials, 'include')
      assert.equal(url.searchParams.get('ep_id'), '42')

      if (url.pathname === '/pgc/view/web/season') {
        return Response.json({
          code: 0,
          result: {
            title: '测试番剧',
            cover: '',
            episodes: [{ id: 99 }],
            section: [
              {
                episodes: [
                  {
                    ep_id: 42,
                    bvid: createJob().bvid,
                    cid: 1,
                    badge,
                    title: '12',
                    long_title: '终章',
                    duration: 120000,
                  },
                ],
              },
            ],
          },
        })
      }

      assert.equal(url.pathname, '/pgc/player/web/v2/playurl')
      assert.equal(url.searchParams.get('cid'), '1')

      return Response.json({ code: 0, result: playback })
    },
  )

  const unavailable = await sendDownloadMessage(
    episodeRequest,
    episodeInfoSchema,
  )

  assert.match(unavailable.unavailableReason || '', /试看/)
  assert.equal(unavailable.episodeLabel, '第 12 集')
  assert.equal(unavailable.episodeTitle, '终章')
  assert.equal(unavailable.pages[0].duration, 120)
  await assert.rejects(sendDownloadMessage(addRequest, z.unknown()), /试看/)

  playback = {
    play_check: { play_detail: 'PLAY_WHOLE' },
    video_info: { is_drm: true },
  }
  await assert.rejects(sendDownloadMessage(addRequest, z.unknown()), /DRM/)
  playback = { play_check: { play_detail: 'AREA_LIMIT' } }
  await assert.rejects(sendDownloadMessage(addRequest, z.unknown()), /地区/)

  playback = {
    play_check: { play_detail: 'PLAY_WHOLE' },
    video_info: {
      duration: 120,
      durl: [{ url: 'https://example.bilivideo.com/part.mp4', size: 2048 }],
    },
  }
  badge = '预告'
  const trailer = await sendDownloadMessage(episodeRequest, episodeInfoSchema)

  assert.match(trailer.unavailableReason || '', /预告/)
  await assert.rejects(sendDownloadMessage(addRequest, z.unknown()), /预告/)
  badge = ''
  const available = await sendDownloadMessage(episodeRequest, episodeInfoSchema)

  assert.equal(available.unavailableReason, undefined)
  assert.equal(
    await sendDownloadMessage(
      {
        type: 'video.estimate',
        epId: 42,
        bvid: available.bvid,
        cid: available.pages[0].cid,
        duration: available.pages[0].duration,
        quality: 'best',
      },
      z.number(),
    ),
    2048,
  )

  const resultSchema = z.object({ added: z.number() })
  const added = await Promise.all([
    sendDownloadMessage(addRequest, resultSchema),
    sendDownloadMessage(addRequest, resultSchema),
  ])

  assert.deepEqual(added.map(result => result.added).sort(), [0, 1])
  const queued = await sendDownloadMessage(
    { type: 'queue.list' },
    downloadJobsSchema,
  )
  const episode = queued.find(job => job.epId === 42)

  assert.ok(episode)
  assert.equal(episode.kind, 'video')
  assert.equal(episode.part, '第 12 集 · 终章')
  assert.equal(
    getDownloadPageUrl(episode),
    'https://www.bilibili.com/bangumi/play/ep42',
  )
  const runId = crypto.randomUUID()

  extension.stored.downloadRunnerTabId = 1
  extension.stored.downloadJobs = [{ ...episode, status: 'saving', runId }]
  assert.equal(
    await sendDownloadMessage(
      {
        type: 'runner.update',
        id: episode.id,
        runId,
        update: { status: 'completed', filename: 'Bilibili/episode.mp4' },
      },
      z.boolean(),
    ),
    true,
  )
  const { records } = await sendDownloadMessage(
    { type: 'library.list' },
    downloadLibrarySchema,
  )
  const record = records.find(item => item.epId === 42)

  assert.ok(record)
  await sendDownloadMessage(
    { type: 'library.requeue', identity: record.identity },
    z.unknown(),
  )
  const requeued = await sendDownloadMessage(
    { type: 'queue.list' },
    downloadJobsSchema,
  )

  assert.ok(requeued.some(job => job.epId === 42 && job.status === 'queued'))
})

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
