import { z } from 'zod'
import { videoIdSchema } from '~/types/download'
import { normalizeMediaUrl } from '~/utils/bilibili/streams'
import { i18n } from '~/utils/i18n'
import { createDownloadPath } from '../files/createDownloadPath'
import type { DownloadJob } from '~/types/download'
import type { SelectedMedia } from '~/utils/bilibili/streams'

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
        message: i18n.t('manifest.invalidNumberOfMediaTracksInTheLocal'),
      })
    }
    if (
      !manifest.filename.endsWith(manifest.kind === 'audio' ? '.m4a' : '.mp4')
    ) {
      context.addIssue({
        code: 'custom',
        message: i18n.t('manifest.invalidOutputExtensionInTheLocalTask'),
      })
    }
  })

/**
 * Export only the selected public media URLs; never cookies or request
 * headers.
 *
 * @param job - Video or audio job providing identity and the submitted
 * filename/directory settings.
 * @param media - Selected downloadable representation and trusted CDN inputs
 * for the same asset kind.
 * @returns A validated version-one manifest containing selected public media
 * URLs, output path, and creation time.
 * @throws {Error} If the job is not media, its audio/video kind disagrees with
 *   media, or its output extension is unsupported.
 * @throws {import('zod').ZodError} If manifest IDs, paths, URLs, input counts,
 *   or size-limited fields are invalid.
 */
export function createNativeManifest(job: DownloadJob, media: SelectedMedia) {
  if (
    !['video', 'audio'].includes(job.kind)
    || (job.kind === 'audio') !== (media.kind === 'audio')
  ) {
    throw new Error(i18n.t('manifest.onlyVideoAndAudioTasksCanBeSent'))
  }
  return nativeManifestSchema.parse({
    version: 1,
    createdAt: Date.now(),
    job: { bvid: job.bvid, cid: job.cid, page: job.page, title: job.title },
    kind: media.kind,
    quality: media.quality,
    filename: createDownloadPath({ ...job, quality: media.quality }),
    inputs: media.inputs,
  })
}
