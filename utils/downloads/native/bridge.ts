import { nativeManifestSchema } from './manifest'
import type { z } from 'zod'

export type NativeManifest = z.infer<typeof nativeManifestSchema>

/**
 * A refreshed signature may change URLs, but never the cached media identity.
 *
 * @param previous - Manifest originally handed to the native helper.
 * @param next - Refreshed manifest whose signed URLs may have changed.
 * @returns Whether job metadata, media kind/quality, output path, and ordered
 * input identities match; timestamps, URLs, and bandwidth are ignored.
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

/**
 * Builds a versioned native-helper request with a validated manifest and
 * bounded framing size.
 *
 * @param type - start for initial handoff, or refresh for updated signed media
 * URLs.
 * @param requestId - Correlation ID used to associate helper replies with this
 * request.
 * @param manifest - Selected media manifest to validate before serialization.
 * @returns A version-one start/refresh request containing the validated
 * manifest.
 * @throws {import('zod').ZodError} If the manifest is invalid.
 * @throws {Error} If the UTF-8 encoded request exceeds 1 MiB.
 */
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
