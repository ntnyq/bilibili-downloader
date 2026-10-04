import type { QualityPreference } from '../../types/download'

export const QUALITY_LABELS: Record<QualityPreference, string> = {
  best: '最高可用画质',
  '1080': '最高 1080P',
  '720': '最高 720P',
  '480': '最高 480P',
}

export const QUALITY_REQUEST_IDS: Record<QualityPreference, number> = {
  best: 127,
  '1080': 80,
  '720': 64,
  '480': 32,
}

/**
 * Fallback only for legacy progressive streams without dimensions.
 */
export const QUALITY_RESOLUTIONS: Record<number, number> = {
  6: 240,
  16: 360,
  32: 480,
  64: 720,
  74: 720,
  80: 1080,
  100: 1080,
  112: 1080,
  116: 1080,
  120: 2160,
  127: 4320,
}
