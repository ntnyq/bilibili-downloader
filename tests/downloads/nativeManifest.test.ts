import assert from 'node:assert/strict'
import { test } from 'node:test'
import { downloadJobSchema } from '../../types/download'
import {
  createNativeManifest,
  nativeManifestSchema,
} from '../../utils/downloads/nativeManifest'
import type { SelectedMedia } from '../../utils/bilibili/streams'

const job = downloadJobSchema.parse({
  id: 'job',
  bvid: 'BV1xx411c7mD',
  cid: 12,
  page: 1,
  part: '第一课',
  duration: 2,
  title: '测试标题',
  owner: 'UP',
  cover: '',
  pageCount: 1,
  createdAt: 1,
  status: 'failed',
  progress: 0,
  receivedBytes: 0,
  totalBytes: 0,
})
const media: SelectedMedia = {
  kind: 'dash',
  quality: '1080P',
  inputs: [
    {
      id: 'video',
      urls: ['https://cdn.bilivideo.com/video?deadline=1'],
      bandwidth: 1000,
    },
    {
      id: 'audio',
      urls: ['https://cdn.bilivideo.com/audio?deadline=1'],
      bandwidth: 100,
    },
  ],
}

test('native export preserves submitted filename settings and exports selected tracks only', () => {
  const result = createNativeManifest(
    { ...job, filenameTemplate: '{owner}_{title}', folderMode: 'video' },
    media,
  )
  assert.equal(
    result.filename,
    'Bilibili/测试标题_BV1xx411c7mD/UP_测试标题.mp4',
  )
  assert.equal(result.inputs.length, 2)
  assert.equal(result.job.cid, 12)
  assert.ok(result.createdAt > 0)
  assert.equal('downloadId' in result, false)
  assert.equal('runId' in result, false)
  assert.equal('headers' in result, false)
})

test('native export rejects nonmedia jobs, mismatched track count and untrusted URLs', () => {
  assert.throws(() => createNativeManifest({ ...job, kind: 'cover' }, media))
  assert.throws(() => createNativeManifest({ ...job, kind: 'audio' }, media))
  const manifest = createNativeManifest(job, media)
  assert.equal(
    nativeManifestSchema.safeParse({ ...manifest, inputs: [media.inputs[0]] })
      .success,
    false,
  )
  for (const url of [
    'http://cdn.bilivideo.com/a',
    'https://evil.test/a',
    'https://cdn.bilivideo.com:8888/a',
    'https://user:password@cdn.bilivideo.com/a',
  ]) {
    assert.equal(
      nativeManifestSchema.safeParse({
        ...manifest,
        inputs: manifest.inputs.map(input => ({
          ...input,
          urls: [url],
        })),
      }).success,
      false,
    )
  }
})

test('native manifest refuses traversal and output extension mismatches', () => {
  const manifest = createNativeManifest(job, media)
  for (const filename of [
    '/absolute.mp4',
    'Bilibili/../escape.mp4',
    'Bilibili/a\\b.mp4',
    'Bilibili/a.m4a',
    'Bilibili//a.mp4',
  ]) {
    assert.equal(
      nativeManifestSchema.safeParse({ ...manifest, filename }).success,
      false,
    )
  }
  assert.equal(
    createNativeManifest(
      { ...job, kind: 'audio' },
      { ...media, kind: 'audio', inputs: [media.inputs[1]!] },
    ).filename.endsWith('.m4a'),
    true,
  )
})
