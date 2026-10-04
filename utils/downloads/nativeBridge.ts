import { nativeManifestSchema } from './nativeManifest'
import type { z } from 'zod'

export type NativeManifest = z.infer<typeof nativeManifestSchema>

/**
 * A refreshed signature may change URLs, but never the cached media identity.
 */
export function isSameNativeTask(
  previous: NativeManifest,
  next: NativeManifest,
) {
  return (
    previous.job.bvid === next.job.bvid
    && previous.job.cid === next.job.cid
    && previous.job.page === next.job.page
    && previous.job.title === next.job.title
    && previous.kind === next.kind
    && previous.quality === next.quality
    && previous.filename === next.filename
    && previous.inputs.length === next.inputs.length
    && previous.inputs.every(
      (input, index) => input.id === next.inputs[index]?.id,
    )
  )
}

export function createNativeRequest(
  type: 'start' | 'refresh',
  requestId: string,
  manifest: NativeManifest,
) {
  const request = {
    version: 1,
    type,
    requestId,
    manifest: nativeManifestSchema.parse(manifest),
  }
  if (
    new TextEncoder().encode(JSON.stringify(request)).byteLength
    > 1024 ** 2
  ) {
    throw new Error('本地任务超过 1 MiB，无法直接交接。')
  }
  return request
}
