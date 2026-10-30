import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { test } from 'node:test'
import { generateChromeMessages, parseMessagesFile } from '@wxt-dev/i18n/build'
import { computed } from 'vue'
import { browser } from 'wxt/browser'
import { catalogs as runtimeCatalogs } from '#i18n-catalogs'
import { filenameTemplateSchema } from '../../types/download'
import { DOWNLOAD_KIND_LABELS } from '../../utils/downloads/labels'
import { getRemuxMessages } from '../../utils/downloads/media/i18n'
import { localizeNativeError } from '../../utils/downloads/native/localizeNativeError'
import { formatI18nMessage } from '../../utils/formatI18nMessage'
import {
  i18n,
  initializeI18n,
  initializeWorkerI18n,
  LANGUAGE_STORAGE_KEY,
  languagePreference,
  setLanguagePreference,
} from '../../utils/i18n'

test('English and Chinese catalogs have identical keys and substitutions', async () => {
  const catalogs = await Promise.all(
    ['en', 'zh_CN'].map(async locale =>
      generateChromeMessages(
        await parseMessagesFile(
          new URL(`../../locales/${locale}.yaml`, import.meta.url).pathname,
        ),
      ),
    ),
  )
  const [english, chinese] = catalogs
  assert.ok(english && chinese)
  for (const [locale, catalog] of [
    ['en', english],
    ['zh_CN', chinese],
  ] as const) {
    assert.deepEqual(
      runtimeCatalogs[locale],
      Object.fromEntries(
        Object.entries(catalog).map(([key, value]) => [key, value.message]),
      ),
      `Runtime catalog is stale: ${locale}. Run wxt prepare.`,
    )
  }
  assert.deepEqual(Object.keys(english).sort(), Object.keys(chinese).sort())
  for (const [key, { message }] of Object.entries(english)) {
    assert.match(key, /^[@\w]+$/, `Invalid browser message key: ${key}`)
    assert.ok(message.trim(), `Empty English message: ${key}`)
    assert.doesNotMatch(
      message,
      /\$\w+\$/,
      `Undeclared named placeholder: ${key}`,
    )
    const translation: string = chinese[key]?.message ?? ''
    assert.ok(translation.trim(), `Empty Chinese message: ${key}`)
    assert.doesNotMatch(
      translation,
      /\$\w+\$/,
      `Undeclared named placeholder: ${key}`,
    )
    assert.deepEqual(
      [
        ...new Set([...message.matchAll(/\$\d/g)].map(match => match[0])),
      ].sort(),
      [
        ...new Set([...translation.matchAll(/\$\d/g)].map(match => match[0])),
      ].sort(),
      `Substitution mismatch: ${key}`,
    )
  }
})

for (const [locale, name, language] of [
  ['en', 'Bilibili Downloader', 'en'],
  ['zh_CN', 'B 站下载器', 'zh-CN'],
]) {
  test(`localizes labels, dynamic text, validation, and dates in ${locale}`, () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        './tests/support/i18n.ts',
        '--input-type=module',
        '-e',
        `
          import { i18n } from './utils/i18n.ts'
          import { filenameTemplateSchema } from './types/download.ts'
          import { groupHistoryRecords } from './utils/downloads/history/groupHistoryRecords.ts'
          const invalid = filenameTemplateSchema.safeParse('')
          const groups = groupHistoryRecords([{ completedAt: new Date(2020, 0, 2).getTime() }], new Date(2026, 0, 1))
          console.log(JSON.stringify({
            name: i18n.t('extensionName'),
            language: i18n.t('localeCode'),
            dynamic: i18n.t('downloadPanel.parts', 3, ['Uploader', 3]),
            singular: i18n.t('downloadPanel.parts', 1, ['Uploader', 1]),
            error: invalid.error?.issues[0]?.message,
            date: groups[0]?.label,
          }))
        `,
      ],
      {
        cwd: new URL('../..', import.meta.url),
        env: { ...process.env, TEST_LOCALE: locale },
        encoding: 'utf8',
      },
    )
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.name, name)
    assert.equal(output.language, language)
    assert.equal(
      output.dynamic,
      locale === 'en' ? 'Uploader · 3 parts' : 'Uploader · 3 个分 P',
    )
    assert.equal(
      output.singular,
      locale === 'en' ? 'Uploader · 1 part' : 'Uploader · 1 个分 P',
    )
    assert.equal(
      output.error,
      locale === 'en' ? 'Enter a filename template.' : '请输入命名模板。',
    )
    assert.equal(
      output.date,
      locale === 'en' ? 'January 2, 2020' : '2020年1月2日',
    )
  })
}

test('remux worker messages work without extension APIs and preserve substitutions', context => {
  const messages = getRemuxMessages()
  const nativeTranslate = i18n.t
  context.after(() => {
    i18n.t = nativeTranslate
  })
  context.mock.method(browser.i18n, 'getMessage', () => {
    throw new Error('Extension APIs are unavailable in a dedicated worker')
  })
  initializeWorkerI18n(messages)
  assert.equal(
    i18n.t('remuxMedia.cannotReadTheMp4VideoTrack'),
    messages['remuxMedia.cannotReadTheMp4VideoTrack'],
  )
  const details = 'FFmpeg: input $1 is invalid'
  assert.equal(
    i18n.t('progressiveMedia.legacyVideoRemuxingFailedCheckThatTheAssets', [
      details,
    ]),
    messages[
      'progressiveMedia.legacyVideoRemuxingFailedCheckThatTheAssets'
    ]?.replace('$1', () => details),
  )
})

test('language changes are persisted, reactive, and synchronized without recreating consumers', async () => {
  await initializeI18n()
  const title = computed(() => i18n.t('extensionName'))
  assert.equal(title.value, 'B 站下载器')
  await setLanguagePreference('en')
  assert.equal(languagePreference.value, 'en')
  assert.equal(title.value, 'Bilibili Downloader')
  assert.equal(DOWNLOAD_KIND_LABELS.video, 'Video MP4')
  assert.equal(
    filenameTemplateSchema.safeParse('').error?.issues[0]?.message,
    'Enter a filename template.',
  )
  assert.equal(
    i18n.t('downloadPanel.parts', 1, ['Uploader', 1]),
    'Uploader · 1 part',
  )
  assert.equal(
    (await browser.storage.local.get(LANGUAGE_STORAGE_KEY))[
      LANGUAGE_STORAGE_KEY
    ],
    'en',
  )

  await browser.storage.local.set({ [LANGUAGE_STORAGE_KEY]: 'zh-CN' })
  assert.equal(title.value, 'B 站下载器')
  assert.equal(DOWNLOAD_KIND_LABELS.video, '视频 MP4')
  assert.equal(
    filenameTemplateSchema.safeParse('').error?.issues[0]?.message,
    '请输入命名模板。',
  )
  await browser.storage.local.remove(LANGUAGE_STORAGE_KEY)
  assert.equal(languagePreference.value, 'browser')
  assert.equal(title.value, 'B 站下载器')
})

test('a failed preference write keeps the current language', async context => {
  context.mock.method(browser.storage.local, 'set', async () => {
    throw new Error('Storage unavailable')
  })
  await assert.rejects(setLanguagePreference('en'), /Storage unavailable/)
  assert.equal(languagePreference.value, 'browser')
})

test('an initial language read cannot overwrite a concurrent change', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      './tests/support/i18n.ts',
      '--input-type=module',
      '-e',
      `
      import { initializeI18n, languagePreference } from './utils/i18n.ts'
      const pending = Promise.withResolvers()
      chrome.storage.local.get = () => pending.promise
      const ready = initializeI18n()
      await chrome.storage.local.set({ languagePreference: 'en' })
      pending.resolve({ languagePreference: 'zh-CN' })
      await ready
      console.log(languagePreference.value)
    `,
    ],
    { cwd: new URL('../..', import.meta.url), encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'en')
})

test('a saved manual language overrides the browser language on startup', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      './tests/support/i18n.ts',
      '--input-type=module',
      '-e',
      `
      import { initializeI18n, i18n } from './utils/i18n.ts'
      import { DOWNLOAD_KIND_LABELS } from './utils/downloads/labels.ts'
      await chrome.storage.local.set({ languagePreference: 'zh-CN' })
      await initializeI18n()
      console.log(JSON.stringify([i18n.t('extensionName'), DOWNLOAD_KIND_LABELS.video]))
    `,
    ],
    {
      cwd: new URL('../..', import.meta.url),
      env: { ...process.env, TEST_LOCALE: 'en' },
      encoding: 'utf8',
    },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), ['B 站下载器', '视频 MP4'])
})

test('installed native-helper diagnostics follow the selected language without a helper upgrade', async context => {
  await setLanguagePreference('en')
  context.after(() => setLanguagePreference('browser'))
  const diagnostic =
    '服务器未返回完整素材（HTTP 503）。 请在扩展中重新导出同一任务，使用相同缓存目录重试。'
  assert.equal(
    localizeNativeError(diagnostic),
    'The server did not return the complete asset (HTTP 503). Export the same task again in the extension and retry using the same cache folder.',
  )
  assert.equal(
    localizeNativeError('素材网络读取中断（TimeoutError）。'),
    'Media network transfer interrupted (TimeoutError).',
  )
  assert.equal(
    localizeNativeError('A diagnostic from a newer helper'),
    'A diagnostic from a newer helper',
  )
  const result = spawnSync(
    'python3',
    [
      '-c',
      `
import ast, json
from pathlib import Path
messages = set()
for filename in ('native-downloader.py', 'native-messaging-host.py'):
    for node in ast.walk(ast.parse((Path('scripts') / filename).read_text())):
        if not isinstance(node, ast.Call):
            continue
        name = node.func.id if isinstance(node.func, ast.Name) else node.func.attr if isinstance(node.func, ast.Attribute) else ''
        index = 1 if name == 'require' else 0 if name in ('DownloadError', 'ExpiredMediaError', 'DownloadCancelled') else -1
        if 0 <= index < len(node.args) and isinstance(node.args[index], ast.Constant) and isinstance(node.args[index].value, str):
            messages.add(node.args[index].value)
print(json.dumps(sorted(messages)))
  `,
    ],
    { cwd: new URL('../..', import.meta.url), encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  const messages: string[] = JSON.parse(result.stdout)
  assert.ok(messages.length > 40)
  for (const message of messages) {
    assert.doesNotMatch(
      localizeNativeError(message),
      /\p{Script=Han}/u,
      `Untranslated native diagnostic: ${message}`,
    )
  }
  await setLanguagePreference('zh-CN')
  assert.equal(localizeNativeError(diagnostic), diagnostic)
})

test('plural arguments containing separators or dollars remain literal in browser and manual modes', async context => {
  context.after(() => setLanguagePreference('browser'))
  const owner = 'Uploader | Name $1'
  await setLanguagePreference('browser')
  assert.equal(
    i18n.t('downloadPanel.parts', 2, [owner, 2]),
    `${owner} · 2 个分 P`,
  )
  await setLanguagePreference('en')
  assert.equal(
    i18n.t('downloadPanel.parts', 2, [owner, 2]),
    `${owner} · 2 parts`,
  )
  assert.equal(
    formatI18nMessage('Cost $$5: $1', [['$& | $1']]),
    'Cost $5: $& | $1',
  )
})
