import { createOpfsFragmentStore } from './fragmentStore'
import type { FragmentStore } from './fragmentStore'

export { createDiskFragmentStore as createDiskFragmentMedia } from './fragmentStore'

export interface FragmentMediaStore extends FragmentStore {
  /**
   * Releases this fragment; the next append opens a fresh file for the track.
   */
  reset: (trackId: number) => Promise<void>
}

/**
 * Reuses one temporary OPFS media file per track after each completed fragment.
 */
export function createOpfsFragmentMedia(directory: FileSystemDirectoryHandle) {
  return createOpfsFragmentStore(
    directory,
    trackId => `fragment-${trackId}.mdat`,
  )
}
