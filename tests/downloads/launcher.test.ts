import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  downloadSettingsPatchSchema,
  downloadSettingsSchema,
} from '../../types/download'
import { createDownloadClickHandler } from '../../utils/downloads/launcher'

test('a pointer click opens the panel only after the double-click window', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const calls: string[] = []
  const actions = createDownloadClickHandler({
    open: () => calls.push('open'),
    download: () => calls.push('download'),
  })
  actions.click(1)
  context.mock.timers.tick(499)
  assert.deepEqual(calls, [])
  context.mock.timers.tick(1)
  assert.deepEqual(calls, ['open'])
})

test('a double click downloads once without opening the panel', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const calls: string[] = []
  const actions = createDownloadClickHandler({
    open: () => calls.push('open'),
    download: () => calls.push('download'),
  })
  actions.click(1)
  context.mock.timers.tick(200)
  actions.click(2)
  actions.click(3)
  context.mock.timers.tick(1000)
  assert.deepEqual(calls, ['download'])
})

test('keyboard activation is immediate and cancellation clears a pending click', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const calls: string[] = []
  const actions = createDownloadClickHandler({
    open: () => calls.push('open'),
    download: () => calls.push('download'),
  })
  actions.click(1)
  actions.click(0)
  assert.deepEqual(calls, ['open'])
  actions.click(1)
  actions.cancel()
  context.mock.timers.tick(1000)
  assert.deepEqual(calls, ['open'])
})

test('legacy settings default to video and quick-download patches preserve the regular quality', () => {
  const legacy = downloadSettingsSchema.parse({ quality: '720' })
  assert.equal(legacy.doubleClickKind, 'video')
  for (const kind of ['video', 'audio', 'cover', 'subtitle', 'danmaku']) {
    const settings = downloadSettingsSchema.parse({
      ...legacy,
      ...downloadSettingsPatchSchema.parse({ doubleClickKind: kind }),
    })
    assert.equal(settings.doubleClickKind, kind)
    assert.equal(settings.quality, '720')
  }
  assert.equal(
    downloadSettingsPatchSchema.safeParse({ doubleClickKind: 'unknown' })
      .success,
    false,
  )
})
