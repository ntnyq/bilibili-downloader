import assert from 'node:assert/strict'
import { test } from 'node:test'
import { batchSourceSchema, MAX_BATCH_ITEMS } from '../../types/batch'
import {
  getBatchPage,
  parseBatchLinks,
  parseBatchSource,
} from '../../utils/bilibili/batch'

const BVID = 'BV1xx411c7mD'
const OTHER_BVID = 'BV1LM4m167ZW'

test('source parsing accepts current and legacy source URLs without mixing kinds', () => {
  assert.deepEqual(parseBatchSource('favorites', '1103407912'), {
    kind: 'favorites',
    id: '1103407912',
  })
  assert.deepEqual(
    parseBatchSource(
      'favorites',
      'https://space.bilibili.com/84912/favlist?ftype=create&fid=1103407912',
    ),
    { kind: 'favorites', id: '1103407912' },
  )
  assert.deepEqual(
    parseBatchSource('favorites', 'https://www.bilibili.com/list/ml1103407912'),
    { kind: 'favorites', id: '1103407912' },
  )
  assert.deepEqual(
    parseBatchSource(
      'collection',
      'https://space.bilibili.com/2142762/lists/3662502?type=season',
    ),
    {
      kind: 'collection',
      mid: '2142762',
      id: '3662502',
      collectionType: 'season',
    },
  )
  assert.deepEqual(
    parseBatchSource(
      'collection',
      'https://space.bilibili.com/1958703906/channel/seriesdetail?sid=547718',
    ),
    {
      kind: 'collection',
      mid: '1958703906',
      id: '547718',
      collectionType: 'series',
    },
  )
  assert.deepEqual(
    parseBatchSource(
      'uploads',
      'https://space.bilibili.com/84912/upload/video',
    ),
    { kind: 'uploads', mid: '84912' },
  )
  assert.deepEqual(parseBatchSource('uploads', '84912'), {
    kind: 'uploads',
    mid: '84912',
  })
  for (const input of [
    '123',
    'https://space.bilibili.com/1/video?sid=2',
    'https://space.bilibili.com/1/lists/2?type=unknown',
    'https://www.bilibili.com/video/BV1xx411c7mD',
  ]) {
    assert.throws(() => parseBatchSource('collection', input))
  }
})

test('source and video URLs reject foreign hosts, credentials, protocols and malformed IDs', () => {
  for (const input of [
    'http://space.bilibili.com/123/video',
    'https://space.bilibili.com.evil.test/123/video',
    'https://example.com/123/video',
    'https://username:password@space.bilibili.com/123/video',
    'https://space.bilibili.com:8443/123/video',
    'https://space.bilibili.com/0/video',
    '-123',
  ]) {
    assert.throws(() => parseBatchSource('uploads', input))
  }
  assert.equal(
    batchSourceSchema.safeParse({ kind: 'uploads', mid: '../1' }).success,
    false,
  )
  const invalid = [
    'http://www.bilibili.com/video/BV1xx411c7mD',
    'https://www.bilibili.com.evil.test/video/BV1xx411c7mD',
    'https://b23.tv/example',
    'https://www.bilibili.com/video/BV1xx411c7mD?p=0',
    'https://www.bilibili.com/video/BV1xx411c7mD?p=1.5',
    'https://www.bilibili.com/video/BV1xx411c7mD?p=1001',
    'https://www.bilibili.com/video/BV1xx411c7mD?p=1&p=2',
    'https://www.bilibili.com/video/BV1xx411c7mD/extra',
    'av0',
  ]
  const parsed = parseBatchLinks(invalid.join('\n'))
  assert.equal(parsed.items.length, 0)
  assert.equal(parsed.errors.length, invalid.length)
})

test('links preserve order and page selection, report original lines and collapse exact duplicates', () => {
  const result = parseBatchLinks(
    `\n${BVID}\n\nhttps://www.bilibili.com/video/${BVID}?p=1\nhttps://www.bilibili.com/video/${BVID}?p=2\nav123\nnot a video\n`,
  )
  assert.deepEqual(result.items, [
    { videoId: BVID, title: BVID, page: 1 },
    { videoId: BVID, title: BVID, page: 2 },
    { videoId: 'av123', title: 'av123', page: 1 },
  ])
  assert.equal(result.duplicateCount, 1)
  assert.equal(result.errors[0]?.line, 7)
  assert.equal(result.errors[0]?.input, 'not a video')
  assert.throws(
    () =>
      parseBatchLinks(
        Array.from({ length: MAX_BATCH_ITEMS + 1 }, () => BVID).join('\n'),
      ),
    /500/,
  )
})

test('favorites paging counts unavailable and non-video entries and handles a real empty-list shape', async context => {
  const requests: string[] = []
  context.mock.method(
    globalThis,
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(input))
      assert.equal(init?.credentials, 'include')
      assert.ok(init?.signal)
      const page = new URL(String(input)).searchParams.get('pn')
      return Response.json({
        code: 0,
        data:
          page === '1'
            ? {
                info: { title: '收藏夹', media_count: 21 },
                medias: [
                  { bvid: BVID, title: '可用视频', type: 2 },
                  { bvid: OTHER_BVID, title: '失效视频', type: 2 },
                  { bvid: BVID, title: '音频收藏', type: 12 },
                  { bvid: '', title: '无 BV', type: 2 },
                ],
                has_more: true,
              }
            : {
                info: { title: '收藏夹', media_count: 0 },
                medias: null,
                has_more: false,
              },
      })
    },
  )
  const source = { kind: 'favorites', id: '123' } as const
  const first = await getBatchPage(source, 1)
  assert.deepEqual(first, {
    title: '收藏夹',
    items: [{ videoId: BVID, title: '可用视频', page: 1 }],
    nextPage: 2,
    total: 21,
    unavailable: 3,
  })
  assert.deepEqual(await getBatchPage(source, 2), {
    title: '收藏夹',
    items: [],
    total: 0,
    unavailable: 0,
  })
  assert.equal(new URL(requests[0] || '').searchParams.get('ps'), '20')
})

test('season and series use their distinct pagination contracts', async context => {
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    const isSeason = url.pathname.endsWith('seasons_archives_list')
    assert.equal(
      url.searchParams.get(isSeason ? 'season_id' : 'series_id'),
      '456',
    )
    return Response.json({
      code: 0,
      data: {
        archives: [{ bvid: BVID, title: '第 31 项', state: 0 }],
        ...(isSeason ? { meta: { name: '合集名称' } } : {}),
        page: isSeason
          ? { page_num: 2, page_size: 30, total: 31 }
          : { num: 2, size: 30, total: 31 },
      },
    })
  })
  for (const collectionType of ['season', 'series'] as const) {
    const page = await getBatchPage(
      { kind: 'collection', mid: '123', id: '456', collectionType },
      2,
    )
    assert.equal(
      page.title,
      collectionType === 'season' ? '合集名称' : '系列 456',
    )
    assert.equal(page.nextPage, undefined)
    assert.equal(page.items[0]?.title, '第 31 项')
    assert.equal(page.total, 31)
  }
})

test('uploads sign WBI requests and skip hidden collection pseudo-videos', async context => {
  const requests: URL[] = []
  context.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    requests.push(url)
    if (url.pathname.endsWith('/nav')) {
      return Response.json({
        code: -101,
        data: {
          wbi_img: {
            img_url:
              'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
            sub_url:
              'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
          },
        },
      })
    }
    assert.equal(url.pathname, '/x/space/wbi/arc/search')
    assert.equal(url.searchParams.get('mid'), '123')
    assert.equal(url.searchParams.get('pn'), '1')
    assert.equal(url.searchParams.get('ps'), '30')
    assert.match(url.searchParams.get('w_rid') || '', /^[\da-f]{32}$/)
    return Response.json({
      code: 0,
      data: {
        page: { pn: 1, ps: 30, count: 31 },
        list: {
          vlist: [
            { bvid: BVID, title: '普通投稿' },
            { bvid: OTHER_BVID, title: '隐藏合集', meta: { attribute: 156 } },
          ],
        },
      },
    })
  })
  const page = await getBatchPage({ kind: 'uploads', mid: '123' }, 1)
  assert.equal(page.items.length, 1)
  assert.equal(page.unavailable, 1)
  assert.equal(page.nextPage, 2)
  assert.ok(requests.some(url => url.pathname.endsWith('/nav')))
})

test('pagination rejects empty continuing pages, repeated page numbers and malformed payloads', async context => {
  const responses = [
    {
      info: { title: '异常收藏夹', media_count: 50 },
      medias: [],
      has_more: true,
    },
    {
      archives: [{ bvid: BVID, title: '重复页' }],
      page: { num: 1, size: 30, total: 50 },
    },
    { archives: [], page: { num: 1, size: 0, total: 0 } },
    { archives: [] },
  ]
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ code: 0, data: responses.shift() }),
  )
  await assert.rejects(
    getBatchPage({ kind: 'favorites', id: '123' }, 1),
    /空分页/,
  )
  const source = {
    kind: 'collection',
    mid: '123',
    id: '456',
    collectionType: 'series',
  } as const
  await assert.rejects(getBatchPage(source, 2), /页码不一致/)
  await assert.rejects(getBatchPage(source, 1))
  await assert.rejects(getBatchPage(source, 1))
  await assert.rejects(getBatchPage(source, 0))
})

test('permission and rate-limit responses propagate without additional requests', async context => {
  let requests = 0
  const codes = [-403, -352]
  context.mock.method(globalThis, 'fetch', async () => {
    requests++
    return Response.json({ code: codes.shift(), message: 'restricted' })
  })
  await assert.rejects(getBatchPage({ kind: 'favorites', id: '123' }, 1))
  await assert.rejects(getBatchPage({ kind: 'uploads', mid: '123' }, 1))
  assert.equal(requests, 2)
})
