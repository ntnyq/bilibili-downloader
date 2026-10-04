import { z } from 'zod'
import { downloadJobSchema } from './download'

export const DOWNLOAD_LIBRARY_STORAGE_KEY = 'downloadLibrary'
export const MAX_LIBRARY_RECORDS = 5000
export const MAX_LIBRARY_BYTES = 3 * 1024 * 1024

export const downloadHistoryRecordSchema = downloadJobSchema
  .omit({ runId: true, error: true, downloadId: true })
  .extend({
    identity: z.string().max(128),
    id: z.string().max(128),
    status: z.literal('completed'),
    title: z.string().max(1000),
    owner: z.string().max(200),
    part: z.string().max(1000),
    cover: z.string().max(2048),
    filename: z.string().max(1024).optional(),
    quality: z.string().max(200).optional(),
    completedAt: z.number().finite().nonnegative().optional(),
  })

export const downloadLibrarySchema = z.object({
  version: z.literal(1),
  evictedCount: z.number().int().nonnegative().default(0),
  records: z.array(downloadHistoryRecordSchema).max(MAX_LIBRARY_RECORDS),
})

export type DownloadHistoryRecord = z.infer<typeof downloadHistoryRecordSchema>
export type DownloadLibrary = z.infer<typeof downloadLibrarySchema>
