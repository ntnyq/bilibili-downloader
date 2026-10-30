import type { VideoInfo } from '../../types/download'

/**
 * UI metadata stays fresh for one minute after a successful request.
 */
export const VIDEO_INFO_CACHE_TTL_MS = 60_000

/**
 * Limits metadata retained by the background worker while browsing videos.
 */
export const VIDEO_INFO_CACHE_MAX_ENTRIES = 20

/**
 * Shares UI metadata requests within the background worker's lifetime.
 * Download creation should keep using the uncached API to validate fresh data.
 *
 * @param loadVideo - Uncached metadata loader; failed requests are shared
 * while pending but never retained.
 * @returns An async lookup that shares in-flight requests and caches
 * successful metadata for VIDEO_INFO_CACHE_TTL_MS with an LRU entry limit.
 * @remarks The returned lookup propagates loader errors and starts expiry only
 *   after a successful load.
 */
export function createVideoInfoCache(
  loadVideo: (videoId: string) => Promise<VideoInfo>,
) {
  const cached = new Map<string, { video: VideoInfo; expiresAt: number }>()
  const pending = new Map<string, Promise<VideoInfo>>()

  function pruneExpired() {
    const now = Date.now()
    for (const [videoId, entry] of cached) {
      if (entry.expiresAt <= now) {
        cached.delete(videoId)
      }
    }
  }

  return async function getCachedVideoInfo(
    videoId: string,
  ): Promise<VideoInfo> {
    pruneExpired()
    const entry = cached.get(videoId)
    if (entry) {
      // Refresh recency without extending the metadata's expiry.
      cached.delete(videoId)
      cached.set(videoId, entry)
      return entry.video
    }
    const request = pending.get(videoId)
    if (request) {
      return request
    }

    const next = loadVideo(videoId)
      .then(video => {
        pruneExpired()
        cached.set(videoId, {
          video,
          expiresAt: Date.now() + VIDEO_INFO_CACHE_TTL_MS,
        })
        for (const oldest of cached.keys()) {
          if (cached.size <= VIDEO_INFO_CACHE_MAX_ENTRIES) {
            break
          }
          cached.delete(oldest)
        }
        return video
      })
      .finally(() => {
        pending.delete(videoId)
      })
    pending.set(videoId, next)
    return next
  }
}
