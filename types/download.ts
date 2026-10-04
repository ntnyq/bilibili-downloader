import { z } from 'zod'

export const videoIdSchema = z.string().regex(/^(?:BV[\dA-Za-z]{10}|av\d+)$/)

export const qualityPreferenceSchema = z.enum(['best', '1080', '720', '480'])
export const downloadKindSchema = z.enum([
  'video',
  'audio',
  'cover',
  'subtitle',
  'danmaku',
])
export const subtitleLanguageSchema = z.enum(['auto', 'zh', 'en'])
export const folderModeSchema = z.enum([
  'flat',
  'owner',
  'video',
  'owner-video',
])
export const DEFAULT_FILENAME_TEMPLATE = '{title}_{bvid}{partSuffix}_{quality}'
export const filenameTemplateSchema = z
  .string()
  .trim()
  .min(1, '请输入命名模板。')
  .max(160, '命名模板不能超过 160 个字符。')
  .refine(
    value =>
      !/[{}]/.test(
        value.replace(
          /\{(?:title|bvid|page|part|partSuffix|owner|quality|type)\}/g,
          '',
        ),
      ),
    '命名模板包含未知变量或不完整的花括号。',
  )
  .refine(
    value => !/[<>:"/\\|?*\p{Cc}]/u.test(value),
    '命名模板不能包含路径分隔符或文件名禁用字符。',
  )
export const downloadSettingsSchema = z.object({
  quality: qualityPreferenceSchema.default('best'),
  isPaused: z.boolean().default(false),
  filenameTemplate: filenameTemplateSchema.default(DEFAULT_FILENAME_TEMPLATE),
  folderMode: folderModeSchema.default('flat'),
  notifyOnComplete: z.boolean().default(false),
})
export const downloadSettingsPatchSchema = z.object({
  quality: qualityPreferenceSchema.optional(),
  isPaused: z.boolean().optional(),
  filenameTemplate: filenameTemplateSchema.optional(),
  folderMode: folderModeSchema.optional(),
  notifyOnComplete: z.boolean().optional(),
})

export const videoPageSchema = z.object({
  cid: z.number().int().positive(),
  page: z.number().int().positive(),
  part: z.string(),
  duration: z.number().nonnegative(),
})

export const videoInfoSchema = z.object({
  bvid: videoIdSchema,
  title: z.string(),
  cover: z.string(),
  owner: z.string(),
  pages: z.array(videoPageSchema).min(1),
})

export const jobStatusSchema = z.enum([
  'queued',
  'paused',
  'native',
  'resolving',
  'downloading',
  'merging',
  'saving',
  'completed',
  'failed',
  'cancelled',
])

export const jobUpdateSchema = z.object({
  status: jobStatusSchema.optional(),
  progress: z.number().min(0).max(100).optional(),
  receivedBytes: z.number().nonnegative().optional(),
  totalBytes: z.number().nonnegative().optional(),
  quality: z.string().optional(),
  error: z.string().optional(),
  downloadId: z.number().int().nonnegative().optional(),
  filename: z.string().max(1024).optional(),
})

export const downloadJobSchema = videoPageSchema.extend({
  id: z.string(),
  bvid: videoIdSchema,
  title: z.string(),
  cover: z.string(),
  owner: z.string().default(''),
  kind: downloadKindSchema.default('video'),
  subtitleLanguage: subtitleLanguageSchema.default('auto'),
  filenameTemplate: filenameTemplateSchema.default(DEFAULT_FILENAME_TEMPLATE),
  folderMode: folderModeSchema.default('flat'),
  filename: z.string().optional(),
  pageCount: z.number().int().positive(),
  createdAt: z.number(),
  runId: z.string().optional(),
  bundleId: z.uuid().optional(),
  bundleSize: z.number().int().positive().max(1000).optional(),
  status: jobStatusSchema,
  progress: z.number(),
  receivedBytes: z.number(),
  totalBytes: z.number(),
  qualityPreference: qualityPreferenceSchema.default('best'),
  quality: z.string().optional(),
  error: z.string().optional(),
  downloadId: z.number().int().optional(),
})

export const downloadJobsSchema = z.array(downloadJobSchema)

export type VideoPage = z.infer<typeof videoPageSchema>
export type VideoInfo = z.infer<typeof videoInfoSchema>
export type DownloadJob = z.infer<typeof downloadJobSchema>
export type JobStatus = z.infer<typeof jobStatusSchema>
export type JobUpdate = z.infer<typeof jobUpdateSchema>
export type DownloadMode = 'all' | 'current' | 'selected'
export type QualityPreference = z.infer<typeof qualityPreferenceSchema>
export type DownloadSettings = z.infer<typeof downloadSettingsSchema>
export type DownloadKind = z.infer<typeof downloadKindSchema>
export type SubtitleLanguage = z.infer<typeof subtitleLanguageSchema>
export type FolderMode = z.infer<typeof folderModeSchema>
