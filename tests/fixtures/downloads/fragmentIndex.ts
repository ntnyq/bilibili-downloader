import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDiskFragmentIndex } from '../../../utils/downloads/media/fragments/fragmentIndex'
import type { TestContext } from 'node:test'

/**
 * A real, seekable disk spool shared by muxing tests and isolated memory runs.
 */
export async function temporaryFragmentIndex(prefix = 'index') {
  const directory = await mkdtemp(join(tmpdir(), 'bilibili-tfra-'))
  const store = createDiskFragmentIndex(async trackId => {
    const file = await open(join(directory, `${prefix}-${trackId}.tmp`), 'w+')
    return {
      async write(data, position) {
        return (await file.write(data, 0, data.length, position)).bytesWritten
      },
      async read(data, position) {
        return (await file.read(data, 0, data.length, position)).bytesRead
      },
      async seal() {},
      close: () => file.close(),
    }
  })
  return {
    store,
    directory,
    async dispose() {
      try {
        await store.dispose()
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  }
}

export async function testFragmentIndex(context: TestContext) {
  const index = await temporaryFragmentIndex()
  context.after(() => index.dispose())
  return index.store
}

/**
 * A separate reusable media spool paired with the same test-owned cleanup.
 */
export async function testFragmentMedia(context: TestContext) {
  const media = await temporaryFragmentIndex('media')
  context.after(() => media.dispose())
  return media.store
}
