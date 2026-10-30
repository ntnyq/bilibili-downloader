/**
 * Extracts a BV/av video identifier and a positive part number from a Bilibili
 * page URL.
 *
 * @param value - Absolute HTTPS www.bilibili.com video URL; p defaults to 1
 * when absent or empty.
 * @returns The videoId and one-based page, or undefined for an unsupported
 * URL, video path, or unsafe/nonpositive part number.
 */
export function parseVideoLocation(value: string) {
  try {
    const url = new URL(value)
    if (url.hostname !== 'www.bilibili.com' || url.protocol !== 'https:') {
      return
    }
    const videoId = /^\/video\/(BV[\dA-Za-z]{10}|av\d+)(?:\/|$)/.exec(
      url.pathname,
    )?.[1]
    if (!videoId) {
      return
    }
    const page = Number(url.searchParams.get('p') || 1)
    if (!Number.isSafeInteger(page) || page < 1) {
      return
    }
    return {
      videoId,
      page,
    }
  } catch {
    return undefined
  }
}
