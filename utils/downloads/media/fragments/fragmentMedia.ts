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
 * Reuses one temporary OPFS media file per track after each completed
 * fragment.
 *
 * @param directory - Caller-owned temporary directory holding a lazily created
 * fragment-trackId.mdat file per track.
 * @returns A disk-backed fragment-media store whose reset operation discards
 * the current track file state.
 * @remarks Store operations propagate OPFS failures and reject invalid ranges
 *   or appends to sealed tracks. Dispose the store before removing its
 *   directory.
 */
export function createOpfsFragmentMedia(directory: FileSystemDirectoryHandle) {
  return createOpfsFragmentStore(
    directory,
    trackId => `fragment-${trackId}.mdat`,
  )
}
