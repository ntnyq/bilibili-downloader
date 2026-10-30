import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDiskFragmentSamples } from '../../../utils/downloads/media/fragments/fragmentSamples'
import type { TestContext } from 'node:test'

/**
 * Real positional files for metadata, media and external sort passes.
 */
export async function temporaryFragmentSamples() {
  const directory = await mkdtemp(join(tmpdir(), 'bilibili-samples-'))
  const store = createDiskFragmentSamples(async (trackId, kind) => {
    const file = await open(join(directory, `${trackId}-${kind}.bin`), 'w+')
    return {
      async read(data, position) {
        return (await file.read(data, 0, data.length, position)).bytesRead
      },
      async write(data, position) {
        return (await file.write(data, 0, data.length, position)).bytesWritten
      },
      truncate: size => file.truncate(size),
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

export async function testFragmentSamples(context: TestContext) {
  const temporary = await temporaryFragmentSamples()
  context.after(() => temporary.dispose())
  return temporary.store
}
