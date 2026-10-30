import { browser } from '#imports'
import { i18n } from '~/utils/i18n'

/**
 * Saves a Blob through browser downloads and retains its object URL until a
 * terminal state.
 *
 * @param blob - File contents whose backing storage must remain alive until
 * this promise settles.
 * @param filename - Relative download path; existing files are uniquified
 * instead of overwritten.
 * @param signal - Cancellation signal; aborting attempts to cancel the browser
 * download.
 * @param onStarted - Async callback receiving the browser download ID before
 * completion polling begins.
 * @returns A promise resolving without a value only after the browser reports
 * the download complete.
 * @throws {Error} If the browser download disappears or becomes interrupted.
 * @throws The browser API error, onStarted rejection, or abort reason; a
 *   started download is cancelled on failure.
 */
export async function saveFile(
  blob: Blob,
  filename: string,
  signal: AbortSignal,
  onStarted: (id: number) => Promise<void>,
) {
  signal.throwIfAborted()
  const url = URL.createObjectURL(blob)
  let downloadId: number | undefined
  try {
    downloadId = await browser.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: 'uniquify',
    })
    await onStarted(downloadId)
    while (true) {
      signal.throwIfAborted()
      const [item] = await browser.downloads.search({ id: downloadId })
      if (item?.state === 'complete') {
        return
      }
      if (!item || item.state === 'interrupted') {
        throw new Error(
          i18n.t('saveFile.fileSavingFailed', [
            item?.error || i18n.t('saveFile.downloadRemoved'),
          ]),
        )
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch (error) {
    if (downloadId !== undefined) {
      await browser.downloads.cancel(downloadId).catch(() => undefined)
    }
    throw error
  } finally {
    // The download must reach a terminal state before releasing its Blob.
    URL.revokeObjectURL(url)
  }
}
