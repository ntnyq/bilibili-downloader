import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_FILENAME_TEMPLATE,
  downloadJobSchema,
  downloadSettingsPatchSchema,
  downloadSettingsSchema,
  filenameTemplateSchema,
} from '../../types/download'
import {
  createDownloadPath,
  sanitizeFilename,
} from '../../utils/downloads/files/createDownloadPath'
import { serializeDownloadHistory } from '../../utils/downloads/history/serializeDownloadHistory'
import {
  createDownloadJobs,
  retryDownloadJobs,
} from '../../utils/downloads/queue/jobs'
import type { DownloadKind, VideoInfo } from '../../types/download'

const video: VideoInfo = {
  bvid: 'BV1xx411c7mD',
  title: '课程',
  cover: 'https://i0.hdslb.com/cover.png',
  owner: '课程 UP',
  pages: [1, 2].map(page => ({
    cid: page * 10,
    page,
    part: `第 ${page} 课`,
    duration: 60,
  })),
}

test('each material gets an independent identity while covers deduplicate across parts', () => {
  const videoJobs = createDownloadJobs(video, 1, 'all', [])
  const audioJobs = createDownloadJobs(video, 1, 'all', videoJobs, {
    kind: 'audio',
  })
  assert.equal(audioJobs.length, 2)
  assert.equal(
    createDownloadJobs(video, 1, 'all', [...videoJobs, ...audioJobs], {
      kind: 'audio',
    }).length,
    0,
  )
  const covers = createDownloadJobs(video, 2, 'all', videoJobs, {
    kind: 'cover',
  })
  assert.equal(covers.length, 1)
  assert.equal(
    createDownloadJobs(video, 2, 'current', covers, { kind: 'cover' }).length,
    0,
  )
  const subtitles = createDownloadJobs(video, 1, 'all', [], {
    kind: 'subtitle',
    subtitleLanguage: 'zh',
  })
  assert.equal(
    createDownloadJobs(video, 1, 'all', subtitles, {
      kind: 'subtitle',
      subtitleLanguage: 'en',
    }).length,
    2,
  )
})

test('retry deduplicates by material, language and cover identity and retains submitted settings', () => {
  const settings = downloadSettingsSchema.parse({
    filenameTemplate: '{owner}_{title}_{type}',
    folderMode: 'owner-video',
  })
  const jobs = (
    ['video', 'audio', 'cover', 'subtitle', 'danmaku'] satisfies DownloadKind[]
  ).flatMap(kind =>
    createDownloadJobs(video, 1, 'current', [], { kind, settings }),
  )
  const cover = jobs.find(job => job.kind === 'cover')
  assert.ok(cover)
  const history = [
    ...jobs,
    { ...cover, id: 'duplicate', cid: 20, page: 2 },
  ].map(job => ({
    ...job,
    status: 'failed' as const,
    filename: 'old-path',
  }))
  const retried = retryDownloadJobs(history)
  assert.equal(retried.filter(job => job.status === 'queued').length, 5)
  assert.equal(retried.at(-1)?.status, 'failed')
  assert.ok(
    retried
      .slice(0, 5)
      .every(
        job =>
          job.filename === undefined
          && job.filenameTemplate === settings.filenameTemplate
          && job.folderMode === 'owner-video',
      ),
  )
})

test('legacy persisted jobs acquire material and file defaults without resetting old preferences', () => {
  const legacy = createDownloadJobs(video, 1, 'current', [], {
    quality: '720',
  })[0]
  assert.ok(legacy)
  const job = downloadJobSchema.parse({
    ...legacy,
    kind: undefined,
    subtitleLanguage: undefined,
    owner: undefined,
    filenameTemplate: undefined,
    folderMode: undefined,
  })
  assert.equal(job.kind, 'video')
  assert.equal(job.qualityPreference, '720')
  assert.equal(job.filenameTemplate, DEFAULT_FILENAME_TEMPLATE)
  assert.deepEqual(
    downloadSettingsPatchSchema.parse({ notifyOnComplete: true }),
    { notifyOnComplete: true },
  )
})

test('filename templates are validated and substitution cannot inject paths or variables', () => {
  for (const template of [
    '',
    '{unknown}',
    '{title',
    '../{title}',
    '{title}\\x',
    'a\n{title}',
  ]) {
    assert.equal(filenameTemplateSchema.safeParse(template).success, false)
  }
  assert.equal(
    filenameTemplateSchema.safeParse('{title}_{page}_{type}').success,
    true,
  )
  const settings = downloadSettingsSchema.parse({
    filenameTemplate: '{title}_{bvid}{partSuffix}_{type}',
    folderMode: 'owner-video',
  })
  const job = createDownloadJobs(
    {
      ...video,
      title: '../{owner}/课程',
      owner: '../CON',
      pages: video.pages.map(page => ({
        ...page,
        part: '../NUL',
      })),
    },
    1,
    'current',
    [],
    { settings, kind: 'audio' },
  )[0]
  assert.ok(job)
  const filename = createDownloadPath(job)
  assert.equal(filename.split('/').length, 4)
  assert.ok(filename.endsWith('.m4a'))
  assert.ok(filename.includes('{owner}'))
  assert.ok(
    filename
      .split('/')
      .every(
        part =>
          !part.startsWith('.')
          && !part.endsWith('.')
          && new TextEncoder().encode(part).length <= 255,
      ),
  )
  assert.equal(sanitizeFilename('CON'), '_CON')
  assert.equal(sanitizeFilename('LPT9.txt'), '_LPT9.txt')
  assert.throws(() => createDownloadPath(job, '../../exe'), /不支持/)
})

test('material filenames use their output extension and cover omits the part suffix', () => {
  for (const [kind, extension] of [
    ['video', 'mp4'],
    ['audio', 'm4a'],
    ['subtitle', 'srt'],
    ['danmaku', 'xml'],
    ['cover', 'jpg'],
  ] as const) {
    const job = createDownloadJobs(video, 2, 'current', [], { kind })[0]
    assert.ok(job)
    const filename = createDownloadPath(job)
    assert.ok(filename.endsWith(`.${extension}`))
    assert.equal(filename.includes('_P'), kind !== 'cover')
  }
})

test('history exports only visible metadata and CSV neutralizes formulas, commas and quotes', () => {
  const jobs = createDownloadJobs(
    { ...video, title: '=HYPERLINK("evil","x")', owner: ' +cmd' },
    1,
    'current',
    [],
  )
  const json = JSON.parse(serializeDownloadHistory(jobs, 'json'))
  assert.equal(json.records.length, 1)
  assert.equal(json.records[0].title, jobs[0]?.title)
  for (const key of ['cover', 'runId', 'downloadId', 'id']) {
    assert.ok(!(key in json.records[0]))
  }
  const csv = serializeDownloadHistory(jobs, 'csv')
  assert.ok(csv.startsWith('\u{FEFF}'))
  assert.ok(csv.includes('"\'=HYPERLINK(""evil"",""x"")"'))
  assert.ok(csv.includes('"\' +cmd"'))
  assert.equal(
    JSON.parse(serializeDownloadHistory([], 'json')).records.length,
    0,
  )
})
