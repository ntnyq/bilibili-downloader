import assert from 'node:assert/strict'
import { test } from 'node:test'
import { browser } from 'wxt/browser'
import { z } from 'zod'
import {
  batchSessionAddReplySchema,
  batchSessionSaveResultSchema,
} from '../../types/batchSession'
import {
  downloadJobSchema,
  downloadJobsSchema,
  episodeInfoSchema,
} from '../../types/download'
import { downloadLibrarySchema } from '../../types/downloadHistory'
import {
  episodeAvailabilityListSchema,
  seasonAddResultSchema,
  seasonInfoSchema,
} from '../../types/season'
import { createBatchSessionData } from '../../utils/downloads/batch/session'
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
  let isSignedIn = false
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

      if (!isSignedIn) {
        return Response.json({ code: -101, message: '账号未登录' })
      }

      return Response.json({ code: 0, result: playback })
    },
  )

  await assert.rejects(
    sendDownloadMessage(addRequest, z.unknown()),
    /请先在 B 站网页登录/,
  )
  assert.deepEqual(
    await sendDownloadMessage({ type: 'queue.list' }, downloadJobsSchema),
    [createJob()],
  )

  isSignedIn = true
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

  await sendDownloadMessage(
    {
      type: 'settings.update',
      settings: { filenameTemplate: '{part}', folderMode: 'video' },
    },
    z.unknown(),
  )
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
    {
      type: 'settings.update',
      settings: {
        quality: '480',
        filenameTemplate: '{title}',
        folderMode: 'flat',
      },
    },
    z.unknown(),
  )
  await sendDownloadMessage(
    { type: 'library.requeue', identity: record.identity },
    z.unknown(),
  )
  const jobsAfterRequeue = await sendDownloadMessage(
    { type: 'queue.list' },
    downloadJobsSchema,
  )
  const requeued = jobsAfterRequeue.find(
    job => job.epId === 42 && job.status === 'queued',
  )

  assert.ok(requeued)
  assert.notEqual(requeued.id, episode.id)
  assert.equal(requeued.cid, episode.cid)
  assert.equal(requeued.qualityPreference, 'best')
  assert.equal(requeued.filenameTemplate, '{part}')
  assert.equal(requeued.folderMode, 'video')
  assert.equal(requeued.filename, undefined)
})

test('season selection lists restrictions and queues unique playable episodes in season order', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  const existing = { ...createJob(), epId: 42, cid: 999 }

  extension.stored.downloadJobs = [existing]
  const playbackRequests: number[] = []
  const previewIds = new Set([43])
  const makeEpisode = (id: number, title: string) => ({
    id,
    bvid: existing.bvid,
    cid: 10,
    title,
    duration: 120000,
  })
  const first = makeEpisode(12, '1')
  const queued = makeEpisode(42, '2')
  const last = makeEpisode(7, '3')

  context.mock.method(
    globalThis,
    'fetch',
    async (input: string, init?: RequestInit) => {
      const url = new URL(input)

      assert.equal(init?.credentials, 'include')

      if (url.pathname === '/pgc/view/web/season') {
        assert.ok(
          url.searchParams.get('season_id') === '1182'
            || ['12', '43'].includes(url.searchParams.get('ep_id') ?? ''),
        )

        return Response.json({
          code: 0,
          result: {
            season_id: 1182,
            title: '测试番剧',
            cover: '',
            episodes: [first, queued, makeEpisode(43, '试看'), last],
            section: [
              {
                episodes: [
                  first,
                  { ...makeEpisode(18, '预告片'), badge: '预告' },
                  { id: 99, title: '花絮' },
                ],
              },
            ],
          },
        })
      }

      assert.equal(url.pathname, '/pgc/player/web/v2/playurl')
      assert.equal(url.searchParams.get('cid'), '10')
      const epId = Number(url.searchParams.get('ep_id'))

      playbackRequests.push(epId)

      return Response.json({
        code: 0,
        result: previewIds.has(epId)
          ? { play_check: { play_detail: 'PLAY_PREVIEW' } }
          : {
              play_check: { play_detail: 'PLAY_WHOLE' },
              video_info: {
                quality: 64,
                durl: [
                  { url: 'https://example.bilivideo.com/part.mp4', size: 2048 },
                ],
              },
            },
      })
    },
  )

  const season = await sendDownloadMessage(
    { type: 'season.get', target: { seasonId: 1182 } },
    seasonInfoSchema,
  )

  assert.deepEqual(
    await sendDownloadMessage(
      { type: 'season.get', target: { epId: 12 } },
      seasonInfoSchema,
    ),
    season,
  )
  assert.deepEqual(
    season.episodes.map(episode => episode.epId),
    [12, 42, 43, 7, 18, 99],
  )
  assert.match(season.episodes[4]?.unavailableReason ?? '', /预告/)
  assert.match(season.episodes[5]?.unavailableReason ?? '', /播放信息/)
  assert.equal(playbackRequests.length, 0)

  const availability = await sendDownloadMessage(
    {
      type: 'season.availability',
      episodes: [
        { epId: 12, cid: 10 },
        { epId: 43, cid: 10 },
      ],
    },
    episodeAvailabilityListSchema,
  )

  assert.equal(availability[0]?.unavailableReason, undefined)
  assert.match(availability[1]?.unavailableReason ?? '', /试看/)

  const request = {
    type: 'queue.season.add',
    seasonId: 1182,
    epIds: [7, 18, 43, 42, 12, 7, 99],
    quality: '720',
  } as const

  await assert.rejects(
    sendDownloadMessage(
      { ...request, epIds: [12, 100] },
      seasonAddResultSchema,
    ),
    /所选剧集已发生变化/,
  )
  assert.deepEqual(extension.stored.downloadJobs, [existing])
  const results = await Promise.all([
    sendDownloadMessage(
      { ...request, epIds: [...request.epIds] },
      seasonAddResultSchema,
    ),
    sendDownloadMessage({ ...request, epIds: [7, 12] }, seasonAddResultSchema),
  ])

  assert.equal(results[0].added + results[1].added, 2)
  assert.equal(results[0].skipped + results[1].skipped, 3)
  assert.deepEqual(results[0].unverified, [])
  assert.deepEqual(
    results[0].unavailable.map(episode => episode.epId),
    [43, 18, 99],
  )
  assert.equal(
    playbackRequests.includes(18) || playbackRequests.includes(99),
    false,
  )
  const jobs = await sendDownloadMessage(
    { type: 'queue.list' },
    downloadJobsSchema,
  )

  assert.deepEqual(
    jobs.map(job => job.epId),
    [42, 12, 7],
  )
  assert.deepEqual(
    jobs.slice(1).map(job => job.qualityPreference),
    ['720', '720'],
  )

  previewIds.delete(43)
  const singleAndSeason = await Promise.all([
    sendDownloadMessage(
      { type: 'queue.episode.add', epId: 43, quality: '720' },
      z.object({ added: z.number() }),
    ),
    sendDownloadMessage({ ...request, epIds: [43] }, seasonAddResultSchema),
  ])

  assert.equal(singleAndSeason[0].added + singleAndSeason[1].added, 1)
  const finalJobs = await sendDownloadMessage(
    { type: 'queue.list' },
    downloadJobsSchema,
  )

  assert.deepEqual(
    finalJobs.map(job => job.epId),
    [42, 12, 7, 43],
  )
  await sendDownloadMessage({ type: 'queue.clear' }, z.null())
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

test('closing the download center preserves more than 100 waiting jobs in order', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  const queued = Array.from({ length: 105 }, (_, index) => ({
    ...createJob(),
    id: `queued-${index}`,
    cid: index + 2,
  }))
  const paused = { ...createJob(), id: 'paused', status: 'paused' as const }
  const running = { ...createJob(), status: 'downloading' as const }

  extension.stored.downloadRunnerTabId = 1
  await extension.local.set({ downloadSettings: { isPaused: true } })
  extension.stored.downloadJobs = [running, paused, ...queued]

  await extension.removed.emit(1)

  const jobs = await sendDownloadMessage(
    { type: 'queue.list' },
    downloadJobsSchema,
  )

  assert.equal(jobs[0]?.status, 'failed')
  assert.deepEqual(jobs.slice(1), [paused, ...queued])
  assert.equal(extension.stored.downloadRunnerTabId, undefined)
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

test('a season deadline leaves unverified episodes eligible for a later retry', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  const episodes = Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    cid: index + 100,
    bvid: 'BV1xx411c7mD',
    title: String(index + 1),
    duration: 1000,
  }))
  const deadline = new AbortController()
  const timeout = AbortSignal.timeout.bind(AbortSignal)
  const requested: number[] = []
  let shouldTimeout = true

  context.mock.method(AbortSignal, 'timeout', (ms: number) =>
    ms === 25_000 && shouldTimeout ? deadline.signal : timeout(ms),
  )
  context.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input)

    if (url.pathname === '/pgc/view/web/season') {
      return Response.json({
        code: 0,
        result: { season_id: 1182, title: 'Test season', cover: '', episodes },
      })
    }

    requested.push(Number(url.searchParams.get('ep_id')))

    if (shouldTimeout && requested.length === 4) {
      deadline.abort(
        new DOMException('Shared deadline exceeded', 'TimeoutError'),
      )
    }

    return Response.json({
      code: 0,
      result: {
        play_check: { play_detail: 'PLAY_WHOLE' },
        video_info: {
          quality: 80,
          durl: [{ url: 'https://cdn.bilivideo.com/test.mp4', size: 32 }],
        },
      },
    })
  })

  const request = {
    type: 'queue.season.add',
    seasonId: 1182,
    epIds: episodes.map(episode => episode.id),
    quality: 'best',
  } as const
  const result = await sendDownloadMessage(request, seasonAddResultSchema)

  assert.deepEqual(requested, [1, 2, 3, 4])
  assert.equal(result.added, 4)
  assert.deepEqual(result.unavailable, [])
  const remaining = result.unverified.map(episode => episode.epId)

  assert.deepEqual(remaining, [5, 6, 7, 8])

  shouldTimeout = false
  const retry = await sendDownloadMessage(
    { ...request, epIds: remaining },
    seasonAddResultSchema,
  )

  assert.equal(retry.added, 4)
  assert.deepEqual(retry.unverified, [])
  assert.equal(
    downloadJobsSchema.parse(extension.stored.downloadJobs).length,
    8,
  )
})

test('cancel waits for a download ID and preserves a saved file in history', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  const runId = crypto.randomUUID()
  const filename = 'Bilibili/test.mp4'
  const saving = { ...createJob(), status: 'saving', runId, filename }

  extension.stored.downloadJobs = [saving, { ...createJob(), id: 'queued' }]
  extension.stored.downloadRunnerTabId = 1
  const cancel = context.mock.method(
    browser.downloads,
    'cancel',
    async () => {},
  )

  context.mock.method(browser.downloads, 'search', async () => [
    { state: 'complete' },
  ])

  await sendDownloadMessage({ type: 'queue.cancel' }, z.null())
  assert.equal(cancel.mock.callCount(), 0)
  assert.deepEqual(
    downloadJobsSchema
      .parse(extension.stored.downloadJobs)
      .map(job => job.status),
    ['saving', 'cancelled'],
  )

  extension.stored.downloadJobs = [{ ...saving, downloadId: 9 }]
  await sendDownloadMessage({ type: 'queue.cancel', id: saving.id }, z.null())
  assert.equal(cancel.mock.callCount(), 1)
  assert.equal(
    downloadJobsSchema.parse(extension.stored.downloadJobs)[0]?.status,
    'completed',
  )
  assert.equal(
    downloadLibrarySchema.parse(extension.stored.downloadLibrary).records[0]
      ?.filename,
    filename,
  )
  assert.equal(
    await sendDownloadMessage(
      {
        type: 'runner.update',
        id: saving.id,
        runId,
        update: { status: 'completed', progress: 100 },
      },
      z.boolean(),
    ),
    true,
  )
})

test('closing the runner archives a file completed during cancellation', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  const job = createJob()

  extension.stored.downloadJobs = [{ ...job, status: 'saving', downloadId: 9 }]
  extension.stored.downloadRunnerTabId = 1
  let state = 'in_progress'

  context.mock.method(browser.downloads, 'cancel', async () => {
    state = 'complete'
  })
  context.mock.method(browser.downloads, 'search', async () => [{ state }])

  await extension.removed.emit(1)

  assert.equal(
    downloadJobsSchema.parse(extension.stored.downloadJobs)[0]?.status,
    'completed',
  )
  assert.equal(
    downloadLibrarySchema.parse(extension.stored.downloadLibrary).records[0]
      ?.id,
    job.id,
  )
})

test('bulk cancellation commits successful stops even if a browser save stays active', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  extension.stored.downloadJobs = [
    { ...createJob(), status: 'saving', downloadId: 9 },
    { ...createJob(), id: 'queued' },
  ]
  context.mock.method(browser.downloads, 'cancel', async () => {
    throw new Error('Browser cancellation failed')
  })
  context.mock.method(browser.downloads, 'search', async () => [
    { state: 'in_progress' },
  ])

  await assert.rejects(sendDownloadMessage({ type: 'queue.cancel' }, z.null()))
  assert.deepEqual(
    downloadJobsSchema
      .parse(extension.stored.downloadJobs)
      .map(job => job.status),
    ['saving', 'cancelled'],
  )
})

test('initialized history remains readable and editable with a corrupt queue', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  extension.stored.downloadJobs = [{ ...createJob(), status: 'completed' }]
  const list = () =>
    sendDownloadMessage({ type: 'library.list' }, downloadLibrarySchema)
  const { records } = await list()
  const [record] = records

  assert.ok(record)
  extension.stored.downloadJobs = [null]
  assert.deepEqual((await list()).records, records)
  await sendDownloadMessage(
    { type: 'library.delete', identity: record.identity },
    z.null(),
  )
  assert.deepEqual((await list()).records, [])
  assert.deepEqual(extension.stored.downloadJobs, [null])
})

test('batch import with completed skipping off can enqueue with corrupt history', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  extension.stored.downloadLibrary = { invalid: true }
  const job = createJob()
  const item = { videoId: job.bvid, page: 1, title: job.title }
  const rowKey = `${item.videoId}:${item.page}`
  const draft = createBatchSessionData()
  const options = { ...draft.options, skipCompleted: false }
  const { session } = await sendDownloadMessage(
    {
      type: 'batch.session.save',
      expectedRevision: null,
      session: {
        ...draft,
        hasPreview: true,
        options,
        optionsSnapshot: options,
        rows: [
          { key: rowKey, item, selected: true, status: 'pending', outcome: '' },
        ],
      },
    },
    batchSessionSaveResultSchema,
  )

  assert.ok(session)
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      code: 0,
      data: {
        bvid: job.bvid,
        title: job.title,
        pic: '',
        owner: { name: 'Owner' },
        pages: [
          {
            cid: job.cid,
            page: job.page,
            part: job.part,
            duration: job.duration,
          },
        ],
      },
    }),
  )

  const { result } = await sendDownloadMessage(
    {
      type: 'batch.add',
      sessionId: session.id,
      expectedRevision: session.revision,
      rowKey,
      item,
      ...options,
    },
    batchSessionAddReplySchema,
  )

  assert.equal(result.added, 1)
  assert.equal(result.shouldStop, false)
  assert.deepEqual(extension.stored.downloadLibrary, { invalid: true })
})

test('season availability keeps throttling and server errors retryable', async context => {
  installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  context.mock.method(globalThis, 'fetch', async (input: string) => {
    switch (new URL(input).searchParams.get('ep_id')) {
      case '1':
        return new Response(null, { status: 429 })
      case '2':
        return new Response(null, { status: 503 })
      case '3':
        return Response.json({ code: -412 })
      default:
        return Response.json({
          code: 0,
          result: { play_check: { play_detail: 'AREA_LIMIT' } },
        })
    }
  })
  const results = await sendDownloadMessage(
    {
      type: 'season.availability',
      episodes: [1, 2, 3, 4].map(epId => ({
        epId,
        cid: epId,
      })),
    },
    episodeAvailabilityListSchema,
  )

  assert.deepEqual(
    results.filter(item => item.retryReason).map(item => item.epId),
    [1, 2, 3],
  )
  assert.deepEqual(
    results.filter(item => item.unavailableReason).map(item => item.epId),
    [4],
  )
})

test('large recovery snapshots can be exported and backups can be managed', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  const previous = [{ id: 'old invalid item' }]
  const corrupt = [createJob(), { title: 'x'.repeat(2 * 1024 * 1024) }]

  extension.stored.downloadJobsRecoveryBackup = previous
  extension.stored.downloadJobs = corrupt
  await assert.rejects(
    sendDownloadMessage({ type: 'queue.recover' }, z.null()),
    /2 MiB/,
  )
  assert.deepEqual(extension.stored.downloadJobs, corrupt)
  const current = await sendDownloadMessage(
    { type: 'queue.recovery.snapshot' },
    z.object({ digest: z.string(), json: z.string() }),
  )

  assert.deepEqual(JSON.parse(current.json), corrupt)
  await assert.rejects(
    sendDownloadMessage(
      { type: 'queue.recover', exportedDigest: '0'.repeat(64) },
      z.null(),
    ),
    /发生了变化/,
  )
  await sendDownloadMessage(
    { type: 'queue.recover', exportedDigest: current.digest },
    z.null(),
  )
  assert.deepEqual(extension.stored.downloadJobs, [createJob()])

  const backup = await sendDownloadMessage(
    { type: 'queue.recovery.backups' },
    z.string(),
  )

  assert.deepEqual(JSON.parse(backup), {
    version: 1,
    backups: { downloadJobsRecoveryBackup: previous },
  })
  await sendDownloadMessage({ type: 'queue.recovery.clear' }, z.null())
  assert.equal(extension.stored.downloadJobsRecoveryBackup, undefined)
  assert.deepEqual(extension.stored.downloadJobs, [createJob()])
})

test('ordinary progress skips the library after migrating legacy completions', async context => {
  const extension = installExtension(context)
  const { registerDownloads } =
    await import('../../entrypoints/background/services/downloads')

  registerDownloads()
  const runId = crypto.randomUUID()
  const legacy = { ...createJob(), id: 'legacy', cid: 2, status: 'completed' }

  extension.stored.downloadRunnerTabId = 1
  extension.stored.downloadJobs = [
    legacy,
    { ...createJob(), status: 'downloading', runId },
  ]
  const progress = {
    type: 'runner.update',
    id: 'job',
    runId,
    update: { receivedBytes: 1 },
  } as const

  assert.equal(await sendDownloadMessage(progress, z.boolean()), true)
  const get = context.mock.method(extension.local, 'get')

  assert.equal(
    await sendDownloadMessage(
      { ...progress, update: { receivedBytes: 2 } },
      z.boolean(),
    ),
    true,
  )
  assert.ok(
    get.mock.calls.every(
      call => !call.arguments[0]?.includes('downloadLibrary'),
    ),
  )
  assert.equal(
    downloadLibrarySchema.parse(extension.stored.downloadLibrary).records[0]
      ?.id,
    legacy.id,
  )
})
