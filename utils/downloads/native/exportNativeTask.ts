import { getVideoMedia } from '~/utils/bilibili/api'
import { saveFile } from '../files/saveFile'
import { createNativeManifest } from './manifest'
import type { DownloadJob } from '~/types/download'

/**
 * Resolves media and saves a portable .bili.json task file for the local
 * helper.
 *
 * @param job - Video or audio job whose quality preference and filename
 * settings are exported.
 * @param signal - Cancellation signal shared by media lookup and browser file
 * saving.
 * @returns A promise resolving without a value after the browser confirms that
 * the task file was saved.
 * @throws {Error} If the kind is unsupported, selected media is invalid, the
 *   task exceeds 1 MiB, or browser saving fails.
 * @throws {import('zod').ZodError} If API data or the generated manifest fails
 *   validation.
 * @throws The API, browser-download, or abort error if task-file export cannot
 *   complete.
 */
export async function exportNativeTask(job: DownloadJob, signal: AbortSignal) {
  if (!['video', 'audio'].includes(job.kind)) {
    throw new Error('仅视频和音频任务支持本地下载。')
  }
  const media = await getVideoMedia(
    job.bvid,
    job.cid,
    signal,
    job.kind === 'audio' ? 'best' : job.qualityPreference,
    job.kind === 'audio' ? 'audio' : 'video',
  )
  const manifest = createNativeManifest(job, media)
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: 'application/json',
  })
  if (blob.size > 1024 * 1024) {
    throw new Error('本地任务文件超过 1 MB，请选择分 P 较少的视频。')
  }
  await saveFile(
    blob,
    `Bilibili/${job.bvid}_P${job.page}_${job.kind}.bili.json`,
    signal,
    async () => {},
  )
}
