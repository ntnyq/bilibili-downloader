import { browser } from '#imports'

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
        throw new Error(`文件保存失败：${item?.error || '下载已被移除'}。`)
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
