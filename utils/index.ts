/**
 * Open a URL in a new tab
 * @param url - URL to open
 */
export function openUrl(url: string | URL) {
  window.open(url.toString(), '_blank')
}
