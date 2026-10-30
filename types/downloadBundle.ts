import { z } from 'zod'
import { i18n } from '~/utils/i18n'
import { downloadKindSchema } from './download'
import type { DownloadJob } from './download'

export const bundleKindsSchema = z
  .array(downloadKindSchema)
  .min(1, { error: () => i18n.t('downloadBundlePicker.selectAtLeastOneAsset') })
  .max(5)
  .transform(kinds => [...new Set(kinds)])

export const bundleAddResultSchema = z.object({
  added: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  bundleId: z.uuid().optional(),
})

export interface DownloadBundleSummary {
  active: number
  bvid: string
  cancelled: number
  completed: number
  createdAt: number
  failed: number
  id: string
  jobs: DownloadJob[]
  missing: number
  progress: number
  status: 'active' | 'cancelled' | 'completed' | 'failed' | 'incomplete'
  title: string
  total: number
}

export type BundleAddResult = z.infer<typeof bundleAddResultSchema>
