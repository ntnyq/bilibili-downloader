import { z } from 'zod'
import { browser } from '#imports'
import { batchCandidateSchema, batchSourceSchema } from '../../types/batch'
import { batchSessionDataSchema } from '../../types/batchSession'
import {
  downloadKindSchema,
  downloadSettingsPatchSchema,
  filenameTemplateSchema,
  folderModeSchema,
  jobUpdateSchema,
  qualityPreferenceSchema,
  subtitleLanguageSchema,
  videoIdSchema,
} from '../../types/download'
import { bundleKindsSchema } from '../../types/downloadBundle'

export const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('video.get'), videoId: videoIdSchema }),
  z.object({ type: z.literal('batch.session.get') }),
  z.object({ type: z.literal('batch.session.reset') }),
  z.object({
    type: z.literal('batch.session.save'),
    session: batchSessionDataSchema,
    expectedRevision: z.number().int().positive().nullable(),
  }),
  z.object({
    type: z.literal('batch.page'),
    source: batchSourceSchema,
    page: z.number().int().min(1).max(1000),
  }),
  z.object({
    type: z.literal('batch.add'),
    sessionId: z.uuid(),
    rowKey: z.string().min(1).max(100),
    expectedRevision: z.number().int().positive(),
    item: batchCandidateSchema,
    mode: z.enum(['current', 'all']),
    quality: qualityPreferenceSchema,
    kind: downloadKindSchema,
    subtitleLanguage: subtitleLanguageSchema,
    skipCompleted: z.boolean(),
    filenameTemplate: filenameTemplateSchema,
    folderMode: folderModeSchema,
  }),
  z.object({
    type: z.literal('queue.add'),
    videoId: videoIdSchema,
    page: z.number().int().positive(),
    mode: z.enum(['current', 'all', 'selected']),
    selectedPages: z.array(z.number().int().positive()).max(1000).optional(),
    quality: qualityPreferenceSchema.default('best'),
    kind: downloadKindSchema.default('video'),
    subtitleLanguage: subtitleLanguageSchema.default('auto'),
  }),
  z.object({ type: z.literal('queue.list') }),
  z.object({ type: z.literal('queue.pause'), id: z.string() }),
  z.object({ type: z.literal('queue.resume'), id: z.string() }),
  z.object({
    type: z.literal('queue.move'),
    id: z.string(),
    direction: z.enum(['up', 'down']),
  }),
  z.object({
    type: z.literal('queue.bundle.add'),
    videoId: videoIdSchema,
    page: z.number().int().positive(),
    mode: z.enum(['current', 'all', 'selected']),
    selectedPages: z.array(z.number().int().positive()).max(1000).optional(),
    quality: qualityPreferenceSchema.default('best'),
    kinds: bundleKindsSchema,
    subtitleLanguage: subtitleLanguageSchema.default('auto'),
  }),
  z.object({ type: z.literal('native.start'), id: z.string() }),
  z.object({
    type: z.literal('native.update'),
    id: z.string(),
    runId: z.uuid(),
    update: jobUpdateSchema.extend({
      status: z.enum(['native', 'completed', 'failed']).optional(),
      downloadId: z.never().optional(),
    }),
  }),
  z.object({ type: z.literal('queue.cancel'), id: z.string().optional() }),
  z.object({ type: z.literal('queue.retry'), id: z.string() }),
  z.object({ type: z.literal('queue.retryFailed') }),
  z.object({ type: z.literal('queue.clear') }),
  z.object({ type: z.literal('library.list') }),
  z.object({
    type: z.literal('library.delete'),
    identity: z.string().min(1).max(200),
  }),
  z.object({ type: z.literal('library.clear') }),
  z.object({
    type: z.literal('library.requeue'),
    identity: z.string().min(1).max(200),
  }),
  z.object({ type: z.literal('settings.get') }),
  z.object({
    type: z.literal('settings.update'),
    settings: downloadSettingsPatchSchema,
  }),
  z.object({ type: z.literal('runner.open') }),
  z.object({ type: z.literal('runner.ready') }),
  z.object({ type: z.literal('runner.claim') }),
  z.object({
    type: z.literal('runner.update'),
    runId: z.string().optional(),
    id: z.string(),
    update: jobUpdateSchema,
  }),
])

const replySchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

/**
 * Sends a typed extension request and validates both its reply envelope and
 * successful payload.
 *
 * @template T - Successful response payload inferred from schema.
 * @param message - Download-channel request matching requestSchema; the
 * channel is attached automatically.
 * @param schema - Zod schema used to validate and infer the successful
 * response payload.
 * @returns A promise resolving to the schema-validated payload of type T.
 * @throws {Error} If the background responds with ok=false.
 * @throws {import('zod').ZodError} If the response envelope or successful
 *   payload is invalid.
 * @throws The runtime messaging rejection if the background cannot receive or
 *   answer the request.
 */
export async function sendDownloadMessage<T>(
  message: z.infer<typeof requestSchema>,
  schema: z.ZodType<T>,
): Promise<T> {
  const reply = replySchema.parse(
    await browser.runtime.sendMessage({
      channel: 'bilibili-download',
      ...message,
    }),
  )
  if (!reply.ok) {
    throw new Error(reply.error)
  }
  return schema.parse(reply.data)
}
