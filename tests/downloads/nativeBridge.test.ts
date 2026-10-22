import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeEventSchema } from '../../types/nativeBridge'
import {
  createNativeRequest,
  isSameNativeTask,
} from '../../utils/downloads/nativeBridge'
import type { NativeManifest } from '../../utils/downloads/nativeBridge'

const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const manifest: NativeManifest = {
  version: 1,
  createdAt: 1,
  job: { bvid: 'BV1xx411c7mD', cid: 1, page: 1, title: '测试' },
  kind: 'audio',
  quality: 'AAC',
  filename: 'Bilibili/测试.m4a',
  inputs: [
    {
      id: 'audio',
      urls: ['https://cdn.bilivideo.com/a?token=first'],
      bandwidth: 100,
    },
  ],
}

test('native refresh accepts signed URL changes and rejects changed cached identity', () => {
  const refreshed = structuredClone(manifest)
  refreshed.inputs[0]!.urls = ['https://cdn.bilivideo.com/a?token=fresh']
  assert.ok(isSameNativeTask(manifest, refreshed))
  for (const changed of [
    { ...refreshed, quality: 'different' },
    { ...refreshed, filename: 'Bilibili/other.m4a' },
    { ...refreshed, job: { ...refreshed.job, cid: 2 } },
    { ...refreshed, inputs: [{ ...refreshed.inputs[0]!, id: 'other' }] },
  ]) {
    assert.equal(isSameNativeTask(manifest, changed), false)
  }
})

test('native request contains only validated media and respects framing size limit', () => {
  const request = createNativeRequest('start', requestId, manifest)
  assert.deepEqual(Object.keys(request), [
    'version',
    'type',
    'requestId',
    'manifest',
  ])
  assert.throws(() =>
    createNativeRequest('start', requestId, {
      ...manifest,
      inputs: [{ ...manifest.inputs[0]!, urls: ['https://localhost/private'] }],
    }),
  )
  assert.throws(
    () =>
      createNativeRequest('start', requestId, {
        ...manifest,
        kind: 'progressive',
        filename: 'Bilibili/test.mp4',
        inputs: Array.from({ length: 512 }, (_, index) => ({
          id: `input-${index}`,
          bandwidth: 0,
          urls: [`https://cdn.bilivideo.com/a?token=${'x'.repeat(3000)}`],
        })),
      }),
    /1 MiB/,
  )
})

test('native responses validate task correlation, bounded progress and output result', () => {
  assert.ok(
    nativeEventSchema.safeParse({
      version: 1,
      requestId,
      type: 'completed',
      filename: '/Downloads/Bilibili/a.m4a',
      quality: 'AAC',
    }).success,
  )
  for (const payload of [
    { version: 2, requestId, type: 'started' },
    { version: 1, requestId: 'other', type: 'started' },
    {
      version: 1,
      requestId,
      type: 'progress',
      status: 'downloading',
      receivedBytes: -1,
    },
    { version: 1, requestId, type: 'completed', filename: '', quality: 'AAC' },
  ]) {
    assert.equal(nativeEventSchema.safeParse(payload).success, false)
  }
})
