import { z } from 'zod'
import { videoIdSchema } from './download'

export const MAX_BATCH_ITEMS = 500
export const BATCH_REQUEST_INTERVAL_MS = 1000

const sourceIdSchema = z.string().regex(/^[1-9]\d{0,19}$/)

export const batchSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('favorites'), id: sourceIdSchema }),
  z.object({
    kind: z.literal('collection'),
    mid: sourceIdSchema,
    id: sourceIdSchema,
    collectionType: z.enum(['season', 'series']),
  }),
  z.object({ kind: z.literal('uploads'), mid: sourceIdSchema }),
])

export const batchCandidateSchema = z.object({
  videoId: videoIdSchema,
  title: z.string().max(1000),
  page: z.number().int().positive().max(1000),
})

export const batchPageSchema = z.object({
  title: z.string(),
  items: z.array(batchCandidateSchema).max(MAX_BATCH_ITEMS),
  nextPage: z.number().int().positive().optional(),
  total: z.number().int().nonnegative().optional(),
  unavailable: z.number().int().nonnegative(),
})

export type BatchSource = z.infer<typeof batchSourceSchema>
export type BatchCandidate = z.infer<typeof batchCandidateSchema>
export type BatchPage = z.infer<typeof batchPageSchema>

export interface BatchLinkError {
  error: string
  input: string
  line: number
}

export interface BatchLinksResult {
  duplicateCount: number
  errors: BatchLinkError[]
  items: BatchCandidate[]
}
