/**
 * Formats a byte count using the download UI byte, kilobyte, or megabyte
 * units.
 *
 * @param bytes - Nonnegative byte count to display; unit thresholds use powers
 * of 1024.
 * @returns Rounded whole bytes below 1 KiB, otherwise one decimal place in KB
 * or MB.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Formats video duration as total minutes and a two-digit seconds remainder.
 *
 * @param seconds - Nonnegative duration in seconds; fractional seconds are
 * rounded down.
 * @returns An m:ss display string; durations of an hour or more retain total
 * minutes.
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
