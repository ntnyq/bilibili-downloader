import { z } from 'zod'
import { i18n } from '~/utils/i18n'
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

/**
 * Selects a subtitle language, preferring Chinese and human captions within
 * the candidates.
 *
 * @param data - Validated player metadata containing subtitle availability and
 * login requirements.
 * @param language - Explicit language prefix, or auto to consider all
 * available languages.
 * @returns The selected trusted HTTPS subtitle URL and a label marking
 * automatic captions.
 * @throws {Error} If login is required, no candidate matches the language, or
 *   the chosen URL is unsupported.
 */
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
      throw new Error(i18n.t('subtitles.signInToBilibiliToAccessSubtitlesThen'))
    }
    throw new Error(
      language === 'auto'
        ? i18n.t('subtitles.thisPartHasNoExportableSubtitles')
        : i18n.t('subtitles.thisPartHasNoSubtitlesInTheSelected'),
    )
  }
  if (!chosen.url) {
    throw new Error(i18n.t('subtitles.thisSubtitleUrlIsNotSupportedUpdateThe'))
  }
  return {
    url: chosen.url,
    label: `${chosen.lan_doc || chosen.lan}${chosen.isAutomatic ? i18n.t('subtitles.automatic') : ''}`,
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
        .refine(cue => cue.to > cue.from, {
          error: () => i18n.t('subtitles.subtitleEndTimeMustBeAfterStartTime'),
        }),
    )
    .max(100000),
})

/**
 * Formats subtitle seconds as an SRT timecode with rounded milliseconds.
 *
 * @param seconds - Nonnegative cue time in seconds, validated before
 * formatting.
 * @returns An HH:MM:SS,mmm timecode with millisecond carry applied.
 */
function timestamp(seconds: number): string {
  const milliseconds = Math.round(seconds * 1000)
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')},${String(milliseconds % 1000).padStart(3, '0')}`
}

/**
 * Convert validated cues to plain SRT in chronological order, rounding
 * milliseconds.
 *
 * @param value - Untrusted Bilibili subtitle JSON containing a body of timed
 * text cues.
 * @returns Chronologically ordered, renumbered SRT with normalized text and
 * escaped markup.
 * @throws {import('zod').ZodError} If cues have invalid fields, excessive
 *   counts, or nonincreasing time ranges.
 * @throws {Error} If no nonempty cue survives text cleanup and millisecond
 *   rounding.
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
    throw new Error(i18n.t('subtitles.subtitleContentIsEmptyNoFileWasSaved'))
  }
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${timestamp(cue.from)} --> ${timestamp(cue.to)}\n${cue.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n`,
    )
    .join('\n')
}
