import { z } from 'zod'

export const NATIVE_HOST_NAME = 'com.ntnyq.bilibili_downloader'

const nativeEnvelopeSchema = z.object({
  version: z.literal(1),
  requestId: z.uuid(),
})

export const nativeEventSchema = z.discriminatedUnion('type', [
  nativeEnvelopeSchema.extend({ type: z.literal('started') }),
  nativeEnvelopeSchema.extend({
    type: z.literal('progress'),
    status: z.enum(['downloading', 'merging', 'saving']),
    inputIndex: z.number().int().min(1).max(512).optional(),
    inputCount: z.number().int().min(1).max(512).optional(),
    receivedBytes: z
      .number()
      .int()
      .nonnegative()
      .max(1024 ** 4)
      .optional(),
  }),
  nativeEnvelopeSchema.extend({ type: z.literal('refreshRequired') }),
  nativeEnvelopeSchema.extend({
    type: z.literal('completed'),
    filename: z.string().min(1).max(1024),
    quality: z.string().min(1).max(1000),
  }),
  nativeEnvelopeSchema.extend({
    type: z.literal('failed'),
    error: z.string().min(1).max(2000),
  }),
])

export type NativeEvent = z.infer<typeof nativeEventSchema>
