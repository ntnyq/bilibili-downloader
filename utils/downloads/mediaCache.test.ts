import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearMediaCache,
  createMediaCache,
  getMediaCacheStats,
  MEDIA_CACHE_CHUNK_BYTES,
  MediaCacheError,
  parseStrongETag,
  pruneMediaCache,
} from './mediaCache'
import type { MediaCacheDirectory } from './mediaCache'

class MemoryDirectory implements MediaCacheDirectory {
  directories = new Map<string, MemoryDirectory>()
  files = new Map<string, File>()
  failWrite: ((name: string) => void) | undefined

  async getDirectoryHandle(
    name: string,
    options?: FileSystemGetDirectoryOptions,
  ): Promise<MemoryDirectory> {
    let directory = this.directories.get(name)
    if (!directory && options?.create) {
      directory = new MemoryDirectory()
      this.directories.set(name, directory)
    }
    if (!directory) {
      throw new DOMException('Missing directory', 'NotFoundError')
    }
    return directory
  }

  async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
    const { files } = this
    const failWrite = () => this.failWrite?.(name)
    if (!this.files.has(name) && options?.create) {
      this.files.set(name, new File([], name))
    }
    if (!this.files.has(name)) {
      throw new DOMException('Missing file', 'NotFoundError')
    }
    return {
      async getFile() {
        const file = files.get(name)
        assert.ok(file)
        return file
      },
      async createWritable() {
        let pending: File | undefined
        return {
          async write(data: string | Uint8Array<ArrayBuffer>) {
            failWrite()
            pending = new File([data], name)
          },
          async close() {
            assert.ok(pending)
            files.set(name, pending)
          },
          abort: async () => {},
        }
      },
    }
  }

  async removeEntry(name: string) {
    this.directories.delete(name)
    this.files.delete(name)
  }

  async *keys(): AsyncIterable<string> {
    yield* this.directories.keys()
    yield* this.files.keys()
  }
}

const REPRESENTATION = {
  resourceKey: 'a'.repeat(64),
  etag: '"version-1"',
  total: 5,
}

function onlyDirectory(parent: MemoryDirectory): MemoryDirectory {
  const directory = [...parent.directories.values()][0]
  assert.ok(directory)
  return directory
}

test('persists bounded immutable chunks and reloads without storing source identities', async () => {
  const root = new MemoryDirectory()
  const key = 'bvid:cid:video:codec:1080p?secret=never-persist'
  const cache = await createMediaCache('job-1', root)
  await cache.reset(key, REPRESENTATION)
  await cache.append(key, new Uint8Array([1, 2]))
  await cache.append(key, new Uint8Array([3, 4, 5]))
  const media = onlyDirectory(onlyDirectory(onlyDirectory(root)))
  assert.equal(media.files.get('chunk-000000')?.size, 2)
  assert.equal(media.files.get('chunk-000001')?.size, 3)
  assert.equal(
    (await media.files.get('manifest.json')?.text())?.includes('secret'),
    false,
  )
  const reloaded = await createMediaCache('job-1', root)
  assert.equal((await reloaded.read(key))?.received, 5)
  await reloaded.complete(key)
  assert.deepEqual(
    [...new Uint8Array(await (await reloaded.blob(key)).arrayBuffer())],
    [1, 2, 3, 4, 5],
  )
  assert.deepEqual(await getMediaCacheStats(root), { entries: 1, bytes: 5 })
  await assert.rejects(
    reloaded.append(key, new Uint8Array(MEDIA_CACHE_CHUNK_BYTES + 1)),
    MediaCacheError,
  )
})

test('commits manifests after chunks and discards orphaned data after a quota failure', async () => {
  const root = new MemoryDirectory()
  const cache = await createMediaCache('job-1', root)
  await cache.reset('video', REPRESENTATION)
  await cache.append('video', new Uint8Array([1, 2]))
  const directory = onlyDirectory(onlyDirectory(onlyDirectory(root)))
  directory.failWrite = name => {
    if (name === 'manifest.json') {
      throw new DOMException('Quota', 'QuotaExceededError')
    }
  }
  await assert.rejects(cache.append('video', new Uint8Array([3])), error => {
    assert.ok(error instanceof MediaCacheError)
    assert.match(error.message, /空间不足/u)
    return true
  })
  assert.equal(directory.files.get('chunk-000001')?.size, 1)
  directory.failWrite = undefined
  const reloaded = await createMediaCache('job-1', root)
  assert.equal((await reloaded.read('video'))?.received, 2)
  assert.equal(directory.files.has('chunk-000001'), false)
  await reloaded.append('video', new Uint8Array([3, 4, 5]))
  await reloaded.complete('video')
  assert.equal((await reloaded.blob('video')).size, 5)
})

test('invalid metadata or missing/mismatched chunks is removed before reuse', async () => {
  for (const corruption of ['metadata', 'missing', 'size']) {
    const root = new MemoryDirectory()
    const cache = await createMediaCache('job', root)
    await cache.reset('video', REPRESENTATION)
    await cache.append('video', new Uint8Array([1, 2]))
    const directory = onlyDirectory(onlyDirectory(onlyDirectory(root)))
    if (corruption === 'metadata') {
      directory.files.set('manifest.json', new File(['{}'], 'manifest.json'))
    } else if (corruption === 'missing') {
      directory.files.delete('chunk-000000')
    } else {
      directory.files.set('chunk-000000', new File(['a'], 'chunk-000000'))
    }
    const reloaded = await createMediaCache('job', root)
    assert.equal(await reloaded.read('video'), undefined)
    assert.equal(onlyDirectory(onlyDirectory(root)).directories.size, 0)
  }
})

test('prunes stale representations and jobs and clears all cache files', async () => {
  const root = new MemoryDirectory()
  const cache = await createMediaCache('kept-job', root)
  for (const key of ['video-new', 'audio-new', 'video-old']) {
    await cache.reset(key, REPRESENTATION)
    await cache.append(key, new Uint8Array([1]))
  }
  const stale = await createMediaCache('removed-job', root)
  await stale.reset('video', REPRESENTATION)
  await stale.append('video', new Uint8Array([2]))
  await cache.retain(['video-new', 'audio-new'])
  assert.equal(await cache.read('video-old'), undefined)
  assert.deepEqual(await getMediaCacheStats(root), { entries: 3, bytes: 3 })
  await pruneMediaCache(['kept-job'], root)
  assert.deepEqual(await getMediaCacheStats(root), { entries: 2, bytes: 2 })
  await clearMediaCache('kept-job', root)
  assert.deepEqual(await getMediaCacheStats(root), { entries: 0, bytes: 0 })
  await clearMediaCache(undefined, root)
  assert.equal(root.directories.size, 0)
})

test('only syntactically valid strong ETags can guard a partial download', () => {
  assert.equal(parseStrongETag('"abc"'), '"abc"')
  for (const etag of [null, 'abc', 'W/"abc"', '"two" "tags"', '"bad\n"']) {
    assert.equal(parseStrongETag(etag), null)
  }
})

test('stats tolerate job directories disappearing during concurrent cleanup', async context => {
  const root = new MemoryDirectory()
  const cache = await createMediaCache('job', root)
  await cache.reset('video', REPRESENTATION)
  await cache.append('video', new Uint8Array([1]))
  context.mock.method(onlyDirectory(root), 'getDirectoryHandle', async () => {
    throw new DOMException('Deleted during stats', 'NotFoundError')
  })
  assert.deepEqual(await getMediaCacheStats(root), { bytes: 0, entries: 0 })
})
