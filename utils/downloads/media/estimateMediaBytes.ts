import type { SelectedMedia } from '~/utils/bilibili/streams'

/**
 * Estimates the combined size of all selected tracks or progressive segments.
 * Returns zero when any input has insufficient size metadata.
 */
export function estimateMediaBytes(
  media: SelectedMedia,
  duration: number,
): number {
  let total = 0
  for (const input of media.inputs) {
    const bytes = input.size || (input.bandwidth * duration) / 8
    if (!bytes) {
      return 0
    }
    total += bytes
  }
  const rounded = Math.round(total)
  return Number.isSafeInteger(rounded) ? rounded : 0
}
