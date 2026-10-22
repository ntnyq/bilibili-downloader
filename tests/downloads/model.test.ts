import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createFilename,
  createJobs,
  parseVideoLocation,
} from '../../utils/downloads/model'
import type { VideoInfo } from '../../types/download'

const video: VideoInfo = {
  bvid: 'BV1xx411c7mD',
  title: '测试视频',
  cover: '',
  owner: '测试 UP',
  pages: [
    { cid: 10, page: 1, part: '第一集', duration: 60 },
    { cid: 20, page: 2, part: '第二集', duration: 90 },
    { cid: 30, page: 3, part: '第三集', duration: 120 },
  ],
}

test('recognizes BV/av URLs and rejects invalid pages or misleading hosts', () => {
  assert.deepEqual(
    parseVideoLocation('https://www.bilibili.com/video/BV1xx411c7mD/?p=2'),
    { videoId: video.bvid, page: 2 },
  )
  assert.deepEqual(parseVideoLocation('https://www.bilibili.com/video/av123'), {
    videoId: 'av123',
    page: 1,
  })
  for (const url of [
    'https://www.bilibili.com/video/BV1xx411c7mD/?p=0',
    'https://www.bilibili.com/video/BV1xx411c7mD/?p=1.5',
    'https://www.bilibili.com.evil.test/video/BV1xx411c7mD',
    'https://www.bilibili.com/bangumi/play/ep123',
  ]) {
    assert.equal(parseVideoLocation(url), undefined)
  }
})

test('single/current downloads target the right CID; all mode deduplicates pending work', () => {
  const current = createJobs(video, 2, 'current', [])
  assert.equal(current.length, 1)
  assert.equal(current[0]?.cid, 20)
  assert.deepEqual(
    createJobs(video, 2, 'all', current).map(job => job.cid),
    [10, 30],
  )
  assert.equal(createJobs(video, 2, 'current', current).length, 0)
  assert.equal(
    createJobs(
      video,
      2,
      'current',
      current.map(job => ({
        ...job,
        status: 'failed',
      })),
    ).length,
    1,
  )
  assert.throws(() => createJobs(video, 4, 'current', []), /当前分 P/)
  const single = createJobs(
    { ...video, pages: video.pages.slice(0, 1) },
    1,
    'current',
    [],
  )
  assert.equal(single.length, 1)
  assert.equal(single[0]?.pageCount, 1)
})

test('filenames are safe, include BV and part, and fit a filesystem component', () => {
  const [job] = createJobs(video, 2, 'current', [])
  assert.ok(job)
  const filename = createFilename({
    ...job,
    title: '../非法:标题\\文件\u{0}',
    quality: '1080P 高清',
  })
  assert.ok(filename.startsWith('Bilibili/'))
  assert.ok(filename.endsWith('.mp4'))
  assert.ok(filename.includes('BV1xx411c7mD_P02'))
  assert.ok(!filename.slice(9).includes('/'))
  assert.ok(!filename.includes('\u{0}'))
  const longName =
    createFilename({
      ...job,
      title: '🎥视频'.repeat(100),
      part: '内容'.repeat(100),
    })
      .split('/')
      .at(-1) || ''
  assert.ok(new TextEncoder().encode(longName).length <= 255)
})
