import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectCoverFormat } from './cover'
import { playDataSchema, selectAudio } from './streams'
import { selectSubtitle, subtitleInfoSchema, subtitlesToSrt } from './subtitles'

test('audio export selects highest available AAC without requiring a video stream', () => {
  const data = playDataSchema.parse({
    dash: {
      audio: [
        {
          id: 1,
          bandwidth: 64000,
          codecs: 'mp4a.40.2',
          baseUrl: 'http://cdn.bilivideo.com/low',
          backupUrl: ['https://backup.bilivideo.com/low'],
        },
        {
          id: 2,
          bandwidth: 192000,
          codecs: 'mp4a.40.2',
          base_url: 'https://cdn.bilivideo.com/high',
        },
        {
          id: 3,
          bandwidth: 999999,
          codecs: 'fLaC',
          baseUrl: 'https://cdn.bilivideo.com/flac',
        },
        {
          id: 4,
          bandwidth: 999999,
          codecs: 'mp4a.40.2',
          baseUrl: 'https://evil.test/audio',
        },
      ],
    },
  })
  const media = selectAudio(data)
  assert.equal(media.kind, 'audio')
  assert.equal(media.inputs.length, 1)
  assert.equal(media.inputs[0]?.urls[0], 'https://cdn.bilivideo.com/high')
  assert.equal(media.quality, 'AAC 192 kbps')
  for (const flag of ['is_preview', 'is_drm']) {
    assert.throws(() => selectAudio({ ...data, [flag]: true }), /受保护/)
  }
  assert.throws(
    () =>
      selectAudio(
        playDataSchema.parse({
          durl: [{ url: 'https://cdn.bilivideo.com/video' }],
        }),
      ),
    /独立 AAC/,
  )
})

test('subtitle selection prefers Chinese and human subtitles and preserves explicit language choice', () => {
  const subtitles = [
    { lan: 'en', lan_doc: '英语', subtitle_url: '//i0.hdslb.com/en.json' },
    {
      lan: 'ai-zh',
      lan_doc: '中文',
      subtitle_url: '//i0.hdslb.com/ai.json',
      type: 1,
    },
    {
      lan: 'zh-CN',
      lan_doc: '简体中文',
      subtitle_url: '//i0.hdslb.com/zh.json',
    },
  ]
  const data = subtitleInfoSchema.parse({ subtitle: { subtitles } })
  assert.equal(selectSubtitle(data, 'auto').url, 'https://i0.hdslb.com/zh.json')
  assert.equal(selectSubtitle(data, 'en').url, 'https://i0.hdslb.com/en.json')
  assert.ok(
    selectSubtitle(
      subtitleInfoSchema.parse({
        subtitle: { subtitles: subtitles.slice(0, 2) },
      }),
      'auto',
    ).label.includes('自动'),
  )
})

test('subtitle absence, login requirements, missing language and untrusted URLs fail explicitly', () => {
  assert.throws(
    () => selectSubtitle(subtitleInfoSchema.parse({}), 'auto'),
    /没有可导出/,
  )
  assert.throws(
    () =>
      selectSubtitle(
        subtitleInfoSchema.parse({ need_login_subtitle: true }),
        'auto',
      ),
    /登录/,
  )
  const data = subtitleInfoSchema.parse({
    subtitle: {
      subtitles: [{ lan: 'ja', subtitle_url: 'https://evil.test/x' }],
    },
  })
  assert.throws(() => selectSubtitle(data, 'zh'), /所选语言/)
  assert.throws(() => selectSubtitle(data, 'auto'), /地址不受支持/)
})

test('SRT conversion sorts, renumbers, handles carry rounding and normalizes text', () => {
  const srt = subtitlesToSrt({
    body: [
      { from: 59.9996, to: 3601.002, content: '第二行\r\n\r\n<内容> & 文本' },
      { from: 0, to: 2.345, content: ' 第一行\u{0} ' },
      { from: 1, to: 2, content: '  ' },
    ],
  })
  assert.ok(srt.startsWith('1\n00:00:00,000 --> 00:00:02,345\n第一行\n\n2\n'))
  assert.ok(srt.includes('00:01:00,000 --> 01:00:01,002'))
  assert.ok(srt.includes('第二行\n&lt;内容&gt; &amp; 文本'))
  assert.throws(() => subtitlesToSrt({ body: [] }), /内容为空/)
  for (const cue of [
    { from: -1, to: 1, content: 'x' },
    { from: 2, to: 1, content: 'x' },
    { from: 0, to: Number.POSITIVE_INFINITY, content: 'x' },
  ]) {
    assert.throws(() => subtitlesToSrt({ body: [cue] }))
  }
})

test('cover format detection rejects HTML and preserves actual image type', () => {
  assert.equal(
    detectCoverFormat(new Uint8Array([255, 216, 255, 224])).extension,
    'jpg',
  )
  assert.equal(
    detectCoverFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))
      .extension,
    'png',
  )
  assert.equal(
    detectCoverFormat(new TextEncoder().encode('RIFFxxxxWEBP')).extension,
    'webp',
  )
  assert.throws(
    () => detectCoverFormat(new TextEncoder().encode('<html>error</html>')),
    /图片/,
  )
})
