import { z } from 'zod'
import { normalizeMediaUrl } from './streams'
import type { SubtitleLanguage } from '../../types/download'

export const subtitleInfoSchema = z.object({
  need_login_subtitle: z.boolean().optional(),
  subtitle: z
    .object({
      subtitles: z
        .array(
          z.object({
            lan: z.string().min(1).max(80),
            lan_doc: z.string().max(120).default(''),
            subtitle_url: z.string().max(4096),
            type: z.number().optional(),
          }),
        )
        .default([]),
    })
    .nullish(),
})

export function selectSubtitle(
  data: z.infer<typeof subtitleInfoSchema>,
  language: SubtitleLanguage,
) {
  const subtitles = (data.subtitle?.subtitles || []).map(item => ({
    ...item,
    url: normalizeMediaUrl(
      item.subtitle_url.startsWith('//')
        ? `https:${item.subtitle_url}`
        : item.subtitle_url,
    ),
    isAutomatic: item.type === 1 || item.lan.startsWith('ai-'),
    language: item.lan.replace(/^ai-/, '').toLowerCase(),
  }))
  const matchesLanguage = (value: string, expected: string) =>
    value === expected || value.startsWith(`${expected}-`)
  const candidates = subtitles.filter(
    item => language === 'auto' || matchesLanguage(item.language, language),
  )
  const chosen = candidates.toSorted(
    (a, b) =>
      Number(matchesLanguage(b.language, 'zh'))
        - Number(matchesLanguage(a.language, 'zh'))
      || Number(a.isAutomatic) - Number(b.isAutomatic),
  )[0]
  if (!chosen) {
    if (data.need_login_subtitle) {
      throw new Error('字幕需要登录 B 站后才能获取，请登录后重试。')
    }
    throw new Error(
      language === 'auto'
        ? '此分 P 没有可导出的字幕。'
        : '此分 P 没有所选语言的字幕，请更换语言后重新添加。',
    )
  }
  if (!chosen.url) {
    throw new Error('字幕地址不受支持，请更新扩展后重试。')
  }
  return {
    url: chosen.url,
    label: `${chosen.lan_doc || chosen.lan}${chosen.isAutomatic ? '（自动）' : ''}`,
  }
}

const subtitleBodySchema = z.object({
  body: z
    .array(
      z
        .object({
          from: z.number().nonnegative().max(3600000),
          to: z.number().nonnegative().max(3600000),
          content: z.string(),
        })
        .refine(cue => cue.to > cue.from, '字幕结束时间必须晚于开始时间。'),
    )
    .max(100000),
})

function timestamp(seconds: number): string {
  const milliseconds = Math.round(seconds * 1000)
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`
}

/**
 * Convert validated cues to plain SRT in chronological order, rounding milliseconds.
 */
export function subtitlesToSrt(value: unknown): string {
  const data = subtitleBodySchema.parse(value)
  const cues = data.body
    .map(cue => ({
      ...cue,
      content: cue.content
        .replace(/\r\n?/g, '\n')
        .replace(/\p{Cc}/gu, char => (char === '\n' ? char : ' '))
        .replace(/\n\s*\n/g, '\n')
        .trim(),
    }))
    .filter(
      cue =>
        cue.content && Math.round(cue.to * 1000) > Math.round(cue.from * 1000),
    )
    .toSorted((a, b) => a.from - b.from)
  if (!cues.length) {
    throw new Error('字幕内容为空，未保存文件。')
  }
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${timestamp(cue.from)} --> ${timestamp(cue.to)}\n${cue.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n`,
    )
    .join('\n')
}
