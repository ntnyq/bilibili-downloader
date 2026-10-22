import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  normalizeMediaUrl,
  playDataSchema,
  selectMedia,
} from '../../utils/bilibili/streams'

function stream(
  id: number,
  width = 1920,
  height = 1080,
  codecs = 'avc1.640032',
) {
  return {
    id,
    width,
    height,
    codecs,
    bandwidth: 1000,
    frameRate: '30',
    baseUrl: `https://example.bilivideo.com/${id}`,
  }
}

test('selects available resolution, FPS and enhanced tier before codec bitrate', () => {
  const result = selectMedia(
    playDataSchema.parse({
      dash: {
        video: [
          { ...stream(80), bandwidth: 100000 },
          stream(112),
          { ...stream(116), frameRate: '60000/1001' },
          stream(120, 3840, 2160, 'hev1.1.6.L150'),
        ],
        audio: [
          stream(30216, 0, 0, 'mp4a.40.2'),
          { ...stream(30280, 0, 0, 'mp4a.40.2'), bandwidth: 2000 },
        ],
      },
      support_formats: [
        { quality: 127, new_description: '8K' },
        { quality: 120, new_description: '4K' },
      ],
    }),
  )
  assert.equal(result.quality, '4K')
  assert.equal(result.inputs[0]?.urls[0], 'https://example.bilivideo.com/120')
  assert.equal(result.inputs[1]?.urls[0], 'https://example.bilivideo.com/30280')
})

test('prefers SDR and AVC at equal quality, not larger bandwidth across codecs', () => {
  const result = selectMedia(
    playDataSchema.parse({
      dash: {
        video: [
          stream(125, 1920, 1080, 'hev1'),
          { ...stream(80, 1920, 1080, 'av01'), bandwidth: 50000 },
          stream(80),
        ],
        audio: [stream(30280, 0, 0, 'mp4a.40.2')],
      },
    }),
  )
  assert.equal(result.inputs[0]?.bandwidth, 1000)
  assert.equal(result.inputs[0]?.urls[0], 'https://example.bilivideo.com/80')
})

test('accepts snake-case URLs and backups, rejects preview and missing audio', () => {
  const video = {
    ...stream(80),
    baseUrl: undefined,
    base_url: 'http://example.bilivideo.cn/video',
    backup_url: ['https://backup.bilivideo.com/video'],
  }
  const data = playDataSchema.parse({
    dash: { video: [video], audio: [stream(30280, 0, 0, 'mp4a.40.2')] },
  })
  assert.equal(selectMedia(data).inputs[0]?.urls.length, 2)
  assert.throws(() => selectMedia({ ...data, is_preview: 1 }), /试看/)
  assert.throws(
    () => selectMedia({ ...data, dash: { video: [video], audio: [] } }),
    /音轨/,
  )
})

test('preserves every progressive fragment and rejects untrusted media URLs', () => {
  const result = selectMedia(
    playDataSchema.parse({
      durl: [
        { url: 'https://a.bilivideo.com/1.flv' },
        { url: 'https://a.bilivideo.com/2.flv' },
      ],
    }),
  )
  assert.equal(result.kind, 'progressive')
  assert.equal(result.inputs.length, 2)
  assert.equal(
    normalizeMediaUrl('https://bilivideo.com.evil.test/video'),
    undefined,
  )
  assert.equal(
    normalizeMediaUrl('https://user:secret@a.bilivideo.com/video'),
    undefined,
  )
  assert.equal(normalizeMediaUrl('file:///etc/passwd'), undefined)
  assert.equal(
    normalizeMediaUrl('http://a.bilivideo.com/video'),
    'https://a.bilivideo.com/video',
  )
})

test('does not downgrade resolution solely to avoid HDR', () => {
  const result = selectMedia(
    playDataSchema.parse({
      dash: {
        video: [stream(80), stream(125, 3840, 2160, 'hev1')],
        audio: [stream(30280, 0, 0, 'mp4a.40.2')],
      },
    }),
  )
  assert.equal(result.inputs[0]?.urls[0], 'https://example.bilivideo.com/125')
})

test('quality caps select the highest eligible actual stream and ignore unavailable advertised quality', () => {
  const data = playDataSchema.parse({
    dash: {
      video: [
        stream(120, 3840, 2160),
        stream(80),
        stream(64, 1280, 720),
        stream(32, 852, 480),
      ],
      audio: [stream(30280, 0, 0, 'mp4a.40.2')],
    },
    support_formats: [{ quality: 127, new_description: '8K' }],
  })
  for (const [preference, id] of [
    ['best', 120],
    ['1080', 80],
    ['720', 64],
    ['480', 32],
  ] as const) {
    assert.equal(
      selectMedia(data, preference).inputs[0]?.urls[0],
      `https://example.bilivideo.com/${id}`,
    )
  }
  const restricted = {
    ...data,
    dash: {
      ...data.dash,
      video: [stream(32, 852, 480)],
      audio: [stream(30280, 0, 0, 'mp4a.40.2')],
    },
  }
  assert.equal(
    selectMedia(restricted, '1080').inputs[0]?.urls[0],
    'https://example.bilivideo.com/32',
  )
})

test('quality caps handle portrait video and refuse unknown dimensions or higher-only streams', () => {
  const data = playDataSchema.parse({
    dash: {
      video: [stream(64, 720, 1280)],
      audio: [stream(30280, 0, 0, 'mp4a.40.2')],
    },
  })
  assert.equal(selectMedia(data, '720').kind, 'dash')
  assert.throws(() => selectMedia(data, '480'), /未返回符合/)
  const unknown = playDataSchema.parse({
    dash: {
      video: [stream(32, 0, 0)],
      audio: [stream(30280, 0, 0, 'mp4a.40.2')],
    },
  })
  assert.throws(() => selectMedia(unknown, '480'), /未返回符合/)
})

test('progressive fallback enforces cap without dropping fragments or guessing unknown quality', () => {
  const data = playDataSchema.parse({
    quality: 64,
    durl: [
      { url: 'https://a.bilivideo.com/1' },
      { url: 'https://a.bilivideo.com/2' },
    ],
  })
  assert.equal(selectMedia(data, '720').inputs.length, 2)
  assert.throws(() => selectMedia(data, '480'), /未返回符合/)
  assert.throws(
    () => selectMedia({ ...data, quality: 999 }, '1080'),
    /未返回符合/,
  )
})

test('representation identity survives signed URL refresh but changes with codecs and asset paths', () => {
  const select = (url: string, codecs = 'avc1.640032') =>
    selectMedia(
      playDataSchema.parse({
        dash: {
          video: [{ ...stream(80), baseUrl: url, codecs }],
          audio: [stream(30280, 0, 0, 'mp4a.40.2')],
        },
      }),
    ).inputs[0]?.id
  const original = select('https://a.bilivideo.com/video.m4s?deadline=1')
  assert.equal(select('https://b.bilivideo.com/video.m4s?deadline=2'), original)
  assert.notEqual(select('https://a.bilivideo.com/other.m4s'), original)
  assert.notEqual(select('https://a.bilivideo.com/video.m4s', 'hev1'), original)
  assert.equal(original?.includes('deadline'), false)
})
