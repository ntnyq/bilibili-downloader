import { getSubtitle } from '~/utils/bilibili/api'
import { MAX_ASSET_BYTES } from '../constants'
import { fetchMediaBytes } from '../media/fetchMediaBytes'
import type { DownloadJob } from '~/types/download'

/**
 * Resolves a subtitle in the chosen language and reads its bounded UTF-8 JSON.
 */
export async function fetchSubtitle(
  {
    bvid,
    cid,
    subtitleLanguage,
  }: Pick<DownloadJob, 'bvid' | 'cid' | 'subtitleLanguage'>,
  signal: AbortSignal,
  onProgress: (received: number) => void = () => {},
): Promise<{ data: unknown; label: string }> {
  const { url, label } = await getSubtitle(bvid, cid, subtitleLanguage, signal)
  const bytes = await fetchMediaBytes(
    [url],
    signal,
    MAX_ASSET_BYTES,
    onProgress,
  )
  signal.throwIfAborted()
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return {
    data: JSON.parse(text),
    label,
  }
}
