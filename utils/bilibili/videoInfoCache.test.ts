import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createVideoInfoCache,
  VIDEO_INFO_CACHE_MAX_ENTRIES,
  VIDEO_INFO_CACHE_TTL_MS,
} from './videoInfoCache'
import type { VideoInfo } from '../../types/download'

function createVideo(bvid: string): VideoInfo {
  return {
    bvid,
    title: '测试视频',
    cover: '',
    owner: 'UP',
    pages: [{ cid: 1, page: 1, part: '第一集', duration: 60 }],
  }
}

test('page and popup share in-flight metadata and subsequent cache hits', async () => {
  const response = Promise.withResolvers<VideoInfo>()
  let calls = 0
  const getVideo = createVideoInfoCache(async () => {
    calls++
    return response.promise
  })
  const video = createVideo('BV1CCYB6AEGv')
  const page = getVideo(video.bvid)
  const popup = getVideo(video.bvid)
  assert.equal(calls, 1)
  response.resolve(video)
  assert.deepEqual(await Promise.all([page, popup]), [video, video])
  assert.deepEqual(await getVideo(video.bvid), video)
  assert.equal(calls, 1)
})

test('expiry starts on success and cache hits do not extend it', async context => {
  let now = 0
  context.mock.method(Date, 'now', () => now)
  let calls = 0
  const getVideo = createVideoInfoCache(async videoId => {
    calls++
    now += 500
    return {
      ...createVideo(videoId),
      title: `版本 ${calls}`,
    }
  })
  assert.equal((await getVideo('BV1CCYB6AEGv')).title, '版本 1')
  now = VIDEO_INFO_CACHE_TTL_MS + 499
  assert.equal((await getVideo('BV1CCYB6AEGv')).title, '版本 1')
  now++
  assert.equal((await getVideo('BV1CCYB6AEGv')).title, '版本 2')
  assert.equal(calls, 2)
})

test('failed shared requests are retried instead of cached', async () => {
  const response = Promise.withResolvers<VideoInfo>()
  const failure = new Error('接口暂时不可用')
  let calls = 0
  const getVideo = createVideoInfoCache(async videoId => {
    calls++
    return calls === 1 ? response.promise : createVideo(videoId)
  })
  const page = getVideo('BV1CCYB6AEGv')
  const popup = getVideo('BV1CCYB6AEGv')
  response.reject(failure)
  await Promise.all([
    assert.rejects(page, error => error === failure),
    assert.rejects(popup, error => error === failure),
  ])
  assert.equal((await getVideo('BV1CCYB6AEGv')).bvid, 'BV1CCYB6AEGv')
  assert.equal(calls, 2)
})

test('different videos load independently and retain separate metadata', async () => {
  const blocked = Promise.withResolvers<VideoInfo>()
  const getVideo = createVideoInfoCache(async videoId =>
    videoId === 'av1' ? blocked.promise : createVideo(videoId),
  )
  const first = getVideo('av1')
  assert.equal((await getVideo('av2')).bvid, 'av2')
  blocked.resolve(createVideo('av1'))
  assert.equal((await first).bvid, 'av1')
  assert.equal((await getVideo('av2')).bvid, 'av2')
})

test('capacity evicts the least recently used video', async () => {
  const calls: string[] = []
  const getVideo = createVideoInfoCache(async videoId => {
    calls.push(videoId)
    return createVideo(videoId)
  })
  for (let index = 1; index <= VIDEO_INFO_CACHE_MAX_ENTRIES; index++) {
    await getVideo(`av${index}`)
  }
  await getVideo('av1')
  await getVideo(`av${VIDEO_INFO_CACHE_MAX_ENTRIES + 1}`)
  await getVideo('av1')
  assert.equal(calls.filter(videoId => videoId === 'av1').length, 1)
  await getVideo('av2')
  assert.equal(calls.filter(videoId => videoId === 'av2').length, 2)
})
