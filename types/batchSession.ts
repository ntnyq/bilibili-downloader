import { z } from 'zod'
import { i18n } from '~/utils/i18n'
import {
  batchCandidateSchema,
  batchSourceSchema,
  MAX_BATCH_ITEMS,
} from './batch'
import {
  downloadKindSchema,
  filenameTemplateSchema,
  folderModeSchema,
  qualityPreferenceSchema,
  subtitleLanguageSchema,
  videoIdSchema,
} from './download'

export const MAX_BATCH_SESSION_BYTES = 1024 * 1024
export const MAX_BATCH_DRAFT_LENGTH = 128_000

export const batchSourceKindSchema = z.enum([
  'links',
  'favorites',
  'collection',
  'uploads',
])

export const batchImportOptionsSchema = z.object({
  mode: z.enum(['current', 'all']),
  quality: qualityPreferenceSchema,
  kind: downloadKindSchema,
  subtitleLanguage: subtitleLanguageSchema,
  skipCompleted: z.boolean(),
  filenameTemplate: filenameTemplateSchema,
  folderMode: folderModeSchema,
})

export const batchAddResultSchema = z.object({
  bvid: videoIdSchema.optional(),
  added: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  error: z.string().max(4000).optional(),
  shouldStop: z.boolean(),
})

export const batchImportRowSchema = z.object({
  key: z.string().max(100),
  item: batchCandidateSchema,
  selected: z.boolean(),
  status: z.enum(['pending', 'adding', 'done', 'failed', 'partial']),
  outcome: z.string().max(4500),
  receipt: batchAddResultSchema.optional(),
})

export const batchSessionDataSchema = z
  .object({
    id: z.uuid(),
    sourceKind: batchSourceKindSchema,
    drafts: z.object({
      links: z.string().max(MAX_BATCH_DRAFT_LENGTH),
      favorites: z.string().max(8000),
      collection: z.string().max(8000),
      uploads: z.string().max(8000),
    }),
    source: batchSourceSchema.optional(),
    title: z.string().max(1000),
    total: z.number().int().nonnegative().optional(),
    nextPage: z.number().int().min(1).max(1000).optional(),
    rows: z.array(batchImportRowSchema).max(MAX_BATCH_ITEMS),
    options: batchImportOptionsSchema,
    optionsSnapshot: batchImportOptionsSchema.optional(),
    hasPreview: z.boolean(),
    isPreviewStale: z.boolean(),
    previewNotice: z.string().max(4000),
    inputErrors: z
      .array(
        z.object({
          error: z.string().max(4000),
          input: z.string().max(MAX_BATCH_DRAFT_LENGTH),
          line: z.number().int().positive(),
        }),
      )
      .max(MAX_BATCH_ITEMS),
    duplicateCount: z.number().int().nonnegative(),
    unavailableCount: z.number().int().nonnegative(),
  })
  .refine(
    session =>
      new TextEncoder().encode(JSON.stringify(session)).byteLength
      <= MAX_BATCH_SESSION_BYTES,
    { error: () => i18n.t('batchSession.theBatchSessionExceeds1MibReduceThe') },
  )
  .refine(
    session =>
      new Set(session.rows.map(row => row.key)).size === session.rows.length
      && session.rows.every(
        row => row.key === `${row.item.videoId}:${row.item.page}`,
      ),
    {
      error() {
        return i18n.t(
          'batchSession.theBatchSessionContainsInvalidOrDuplicateVideo',
        )
      },
    },
  )

export const batchSessionSchema = batchSessionDataSchema.safeExtend({
  revision: z.number().int().positive(),
  updatedAt: z.number().int().nonnegative(),
})

export const batchSessionSaveResultSchema = z.object({
  session: batchSessionSchema.nullable(),
  conflict: z.boolean(),
})

export const batchSessionAddReplySchema = z.object({
  result: batchAddResultSchema,
  session: batchSessionSchema,
})

export type BatchSourceKind = z.infer<typeof batchSourceKindSchema>
export type BatchImportOptions = z.infer<typeof batchImportOptionsSchema>
export type BatchImportRow = z.infer<typeof batchImportRowSchema>
export type BatchAddResult = z.infer<typeof batchAddResultSchema>
export type BatchSessionData = z.infer<typeof batchSessionDataSchema>
export type BatchSession = z.infer<typeof batchSessionSchema>
export type BatchSessionSaveResult = z.infer<
  typeof batchSessionSaveResultSchema
>
