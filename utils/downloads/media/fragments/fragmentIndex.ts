import { createOpfsFragmentStore } from './fragmentStore'

export { createDiskFragmentStore as createDiskFragmentIndex } from './fragmentStore'
export type {
  FragmentStoreFile as FragmentIndexFile,
  FragmentStore as FragmentIndexStore,
} from './fragmentStore'

/**
 * Keeps completed-fragment TFRA records in per-track OPFS files until
 * finalization.
 *
 * @param directory - Caller-owned temporary remux directory in which
 * index-trackId.tfra files are created lazily.
 * @returns A per-track disk index store with append/read, reset, and
 * idempotent disposal operations.
 * @remarks Store operations propagate OPFS failures, reject invalid tracks or
 *   ranges, and seal a track before its first read. The caller removes the
 *   containing directory after disposal.
 */
export function createOpfsFragmentIndex(directory: FileSystemDirectoryHandle) {
  return createOpfsFragmentStore(directory, trackId => `index-${trackId}.tfra`)
}
