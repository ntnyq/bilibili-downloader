/**
 * Extracts an Error message or stringifies another thrown value for display.
 *
 * @param error - Unknown thrown value or rejected promise reason.
 * @returns The Error.message string, or String(error) for non-Error values.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
