import { getVideoMedia } from '../bilibili/api'
import { createNativeManifest } from './nativeManifest'
import { saveFile } from './saveFile'
import type { DownloadJob } from '../../types/download'

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
