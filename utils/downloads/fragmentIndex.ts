import { createOpfsFragmentStore } from './fragmentStore'

export { createDiskFragmentStore as createDiskFragmentIndex } from './fragmentStore'
export type {
  FragmentStoreFile as FragmentIndexFile,
  FragmentStore as FragmentIndexStore,
} from './fragmentStore'

/**
 * Keeps completed-fragment TFRA records in per-track OPFS files until finalization.
 */
export function createOpfsFragmentIndex(directory: FileSystemDirectoryHandle) {
  return createOpfsFragmentStore(directory, trackId => `index-${trackId}.tfra`)
}
