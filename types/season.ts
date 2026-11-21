import { z } from 'zod'
import { episodeIdSchema, episodeInfoSchema, videoPageSchema } from './download'

export const SEASON_EPISODES_PER_PAGE = 12

export const seasonIdSchema = z.number().int().positive()
export const seasonTargetSchema = z.union([
  z.object({ seasonId: seasonIdSchema }),
  z.object({ epId: episodeIdSchema }),
])
export const episodePlaybackTargetSchema = z.object({
  epId: episodeIdSchema,
  cid: videoPageSchema.shape.cid,
})
const seasonEpisodeSchema = episodeInfoSchema
  .pick({
    epId: true,
    episodeLabel: true,
    episodeTitle: true,
    unavailableReason: true,
  })
  .extend({ cid: episodePlaybackTargetSchema.shape.cid.optional() })

export const seasonInfoSchema = z.object({
  seasonId: seasonIdSchema,
  title: z.string(),
  cover: z.string(),
  episodes: z.array(seasonEpisodeSchema),
})
const episodeAvailabilitySchema = z.object({
  epId: episodeIdSchema,
  unavailableReason: z.string().optional(),
})

export const episodeAvailabilityListSchema = z.array(episodeAvailabilitySchema)
export const seasonAddResultSchema = z.object({
  added: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  unavailable: episodeAvailabilityListSchema,
})

export type SeasonTarget = z.infer<typeof seasonTargetSchema>
export type SeasonInfo = z.infer<typeof seasonInfoSchema>
export type SeasonEpisode = z.infer<typeof seasonEpisodeSchema>
export type EpisodeAvailability = z.infer<typeof episodeAvailabilitySchema>
export type EpisodePlaybackTarget = z.infer<typeof episodePlaybackTargetSchema>
