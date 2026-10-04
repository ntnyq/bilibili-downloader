import { z } from 'zod'
import { videoIdSchema } from '../../types/download'
import { normalizeMediaUrl } from '../bilibili/streams'
import { createFilename } from './filename'
import type { DownloadJob } from '../../types/download'
import type { SelectedMedia } from '../bilibili/streams'

export const nativeManifestSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.number().int().positive(),
    job: z.object({
      bvid: videoIdSchema,
      cid: z.number().int().positive(),
      page: z.number().int().positive(),
      title: z.string().max(10000),
    }),
    kind: z.enum(['dash', 'audio', 'progressive']),
    quality: z.string().max(1000),
    filename: z
      .string()
      .max(1024)
      .refine(
        value =>
          value.startsWith('Bilibili/')
          && /\.(?:mp4|m4a)$/.test(value)
          && value
            .split('/')
            .every(
              part =>
                !!part
                && !['.', '..'].includes(part)
                && !/[<>:"\\|?*\p{Cc}]/u.test(part),
            ),
      ),
    inputs: z
      .array(
        z.object({
          id: z.string().min(1).max(4096),
          urls: z
            .array(
              z
                .string()
                .max(16384)
                .refine(
                  value =>
                    value.startsWith('https:')
                    && normalizeMediaUrl(value) === value,
                ),
            )
            .min(1)
            .max(16),
          bandwidth: z.number().nonnegative(),
        }),
      )
      .min(1)
      .max(512),
  })
  .superRefine((manifest, context) => {
    const count = manifest.inputs.length
    if (
      (manifest.kind === 'dash' && count !== 2)
      || (manifest.kind === 'audio' && count !== 1)
    ) {
      context.addIssue({
        code: 'custom',
        message: '本地任务的媒体轨数量无效。',
      })
    }
    if (
      !manifest.filename.endsWith(manifest.kind === 'audio' ? '.m4a' : '.mp4')
    ) {
      context.addIssue({
        code: 'custom',
        message: '本地任务的输出扩展名无效。',
      })
    }
  })

/**
 * Export only the selected public media URLs; never cookies or request headers.
 */
export function createNativeManifest(job: DownloadJob, media: SelectedMedia) {
  if (
    !['video', 'audio'].includes(job.kind)
    || (job.kind === 'audio') !== (media.kind === 'audio')
  ) {
    throw new Error('仅视频和音频任务可交给本地 FFmpeg 助手。')
  }
  return nativeManifestSchema.parse({
    version: 1,
    createdAt: Date.now(),
    job: { bvid: job.bvid, cid: job.cid, page: job.page, title: job.title },
    kind: media.kind,
    quality: media.quality,
    filename: createFilename({ ...job, quality: media.quality }),
    inputs: media.inputs,
  })
}
