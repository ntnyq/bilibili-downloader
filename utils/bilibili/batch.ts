import { z } from 'zod'
import {
  batchCandidateSchema,
  batchPageSchema,
  batchSourceSchema,
  MAX_BATCH_ITEMS,
} from '../../types/batch'
import { getWbiKey, requestApi } from './api'
import { signWbi } from './wbi'
import type {
  BatchCandidate,
  BatchLinksResult,
  BatchPage,
  BatchSource,
} from '../../types/batch'

const SOURCE_ID_PATTERN = /^[1-9]\d{0,19}$/
const VIDEO_ID_PATTERN = /^(?:BV[\dA-Za-z]{10}|av[1-9]\d*)$/
const PAGE_SIZE = 30
const FAVORITES_PAGE_SIZE = 20
const countSchema = z.number().int().nonnegative()
const pageNumberSchema = z.number().int().positive()
const sourceRowSchema = z.object({
  bvid: z.string(),
  title: z.string(),
  type: z.number().optional(),
  state: z.number().optional(),
  meta: z.object({ attribute: z.number().optional() }).nullish(),
})
const favoritesPageSchema = z.object({
  info: z.object({ title: z.string(), media_count: countSchema }),
  medias: z.array(z.unknown()).nullable(),
  has_more: z.boolean(),
})
const collectionPageSchema = z.object({
  archives: z.array(z.unknown()),
  meta: z.object({ name: z.string() }).optional(),
  page: z.object({
    page_num: pageNumberSchema.optional(),
    page_size: pageNumberSchema,
    total: countSchema,
  }),
})
const seriesPageSchema = z.object({
  archives: z.array(z.unknown()),
  page: z.object({
    num: pageNumberSchema,
    size: pageNumberSchema,
    total: countSchema,
  }),
})
const uploadsPageSchema = z.object({
  list: z.object({ vlist: z.array(z.unknown()) }),
  page: z.object({
    pn: pageNumberSchema,
    ps: pageNumberSchema,
    count: countSchema,
  }),
})

/**
 * Parses an HTTPS URL restricted to supported Bilibili page hosts.
 *
 * @param input - Absolute page URL to validate; credentials and explicit
 * non-default ports are rejected.
 * @returns The parsed URL for a supported Bilibili host.
 * @throws {TypeError} If input cannot be parsed as an absolute URL.
 * @throws {Error} If the protocol, credentials, port, or hostname is
 *   unsupported.
 */
function parseBilibiliUrl(input: string): URL {
  const url = new URL(input)
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || !['bilibili.com', 'www.bilibili.com', 'space.bilibili.com'].includes(
      url.hostname,
    )
  ) {
    throw new Error('请使用 B 站的 HTTPS 完整链接。')
  }
  return url
}

/**
 * Resolves only supported source identifiers; remote URLs are never fetched.
 *
 * @param kind - Expected source kind: favorites, uploads, or collection.
 * @param value - Source URL, or numeric favorites/owner ID; surrounding
 * whitespace is ignored.
 * @returns A validated source descriptor containing the IDs and collection
 * subtype required for pagination.
 * @throws {Error} If the input is invalid, lacks required IDs, or does not
 *   match the selected source kind.
 * @throws {import('zod').ZodError} If a direct numeric ID fails source
 *   validation.
 */
export function parseBatchSource(
  kind: BatchSource['kind'],
  value: string,
): BatchSource {
  const input = value.trim()
  if (SOURCE_ID_PATTERN.test(input) && kind !== 'collection') {
    return batchSourceSchema.parse(
      kind === 'favorites' ? { kind, id: input } : { kind, mid: input },
    )
  }
  let url: URL
  try {
    url = parseBilibiliUrl(input)
  } catch (error) {
    throw new Error(
      kind === 'collection'
        ? '请输入包含 UP 主 UID 和合集 ID 的完整 B 站合集或系列链接。'
        : '请输入有效的数字 ID 或 B 站 HTTPS 链接。',
      { cause: error },
    )
  }
  const path = url.pathname.replace(/\/$/, '')
  const isSpace = url.hostname === 'space.bilibili.com'
  if (kind === 'favorites') {
    const favoriteId =
      isSpace && /^\/\d+\/favlist$/.test(path)
        ? url.searchParams.get('fid')
        : isSpace
          ? undefined
          : /^\/(?:medialist\/detail|medialist\/play|list)\/ml(\d+)$/.exec(
              path,
            )?.[1]
    const parsed = batchSourceSchema.safeParse({ kind, id: favoriteId })
    if (parsed.success) {
      return parsed.data
    }
  }
  if (kind === 'uploads' && isSpace) {
    const mid = /^\/(\d+)(?:\/(?:upload\/)?video)?$/.exec(path)?.[1]
    const parsed = batchSourceSchema.safeParse({ kind, mid })
    if (parsed.success) {
      return parsed.data
    }
  }
  if (kind === 'collection' && isSpace) {
    const modern = /^\/(\d+)\/lists\/(\d+)$/.exec(path)
    const legacy = /^\/(\d+)\/channel\/(collectiondetail|seriesdetail)$/.exec(
      path,
    )
    const collectionType = modern
      ? url.searchParams.get('type') || 'season'
      : legacy?.[2] === 'seriesdetail'
        ? 'series'
        : 'season'
    const parsed = batchSourceSchema.safeParse({
      kind,
      mid: modern?.[1] || legacy?.[1],
      id: modern?.[2] || url.searchParams.get('sid'),
      collectionType,
    })
    if (parsed.success) {
      return parsed.data
    }
  }
  throw new Error('链接与所选来源类型不匹配，或缺少有效 ID。')
}

/**
 * Parses one BV/av identifier or video URL into a batch candidate.
 *
 * @param input - Trimmed video identifier or HTTPS video URL with at most one
 * p query parameter.
 * @returns A validated candidate with its identifier, placeholder title, and
 * part number from 1 to 1000.
 * @throws {TypeError} If the input is not an identifier and cannot be parsed
 *   as a URL.
 * @throws {Error} If the host, path, or part selection is unsupported.
 * @throws {import('zod').ZodError} If a direct video identifier fails
 *   candidate validation.
 */
function parseBatchLink(input: string): BatchCandidate {
  if (VIDEO_ID_PATTERN.test(input)) {
    return batchCandidateSchema.parse({ videoId: input, title: input, page: 1 })
  }
  const url = parseBilibiliUrl(input)
  if (url.hostname === 'space.bilibili.com') {
    throw new Error('请输入单个视频链接。')
  }
  const videoId = /^\/video\/(BV[\dA-Za-z]{10}|av[1-9]\d*)\/?$/.exec(
    url.pathname,
  )?.[1]
  const pageValue = url.searchParams.get('p')
  if (
    !videoId
    || (pageValue !== null && !/^[1-9]\d{0,3}$/.test(pageValue))
    || url.searchParams.getAll('p').length > 1
  ) {
    throw new Error('请输入有效的视频链接，分 P 页码须为 1–1000。')
  }
  const parsed = batchCandidateSchema.safeParse({
    videoId,
    title: videoId,
    page: pageValue ? Number(pageValue) : 1,
  })
  if (!parsed.success) {
    throw new Error('分 P 页码须为 1–1000。')
  }
  return parsed.data
}

/**
 * Parses a multiline video list, retaining input order and reporting errors
 * per line.
 *
 * @param text - Newline-separated identifiers or URLs; blank lines are
 * ignored.
 * @returns Unique video/part candidates, line-numbered validation errors, and
 * an exact-duplicate count.
 * @throws {Error} If text exceeds the length limit or nonblank lines exceed
 *   MAX_BATCH_ITEMS.
 */
export function parseBatchLinks(text: string): BatchLinksResult {
  if (text.length > 1024 * 1024) {
    throw new Error('链接列表文本不能超过 1 MB。')
  }
  const lines = text.split(/\r?\n/)
  if (lines.filter(line => line.trim()).length > MAX_BATCH_ITEMS) {
    throw new Error(`每次最多导入 ${MAX_BATCH_ITEMS} 行链接。`)
  }
  const result: BatchLinksResult = { items: [], errors: [], duplicateCount: 0 }
  const seen = new Set<string>()
  for (const [index, line] of lines.entries()) {
    const input = line.trim()
    if (!input) {
      continue
    }
    try {
      const candidate = parseBatchLink(input)
      const key = `${candidate.videoId}:${candidate.page}`
      if (seen.has(key)) {
        result.duplicateCount++
      } else {
        seen.add(key)
        result.items.push(candidate)
      }
    } catch (error) {
      result.errors.push({
        line: index + 1,
        input,
        error: error instanceof Error ? error.message : '无法识别此视频链接。',
      })
    }
  }
  return result
}

/**
 * Filters inaccessible and malformed API rows into batch video candidates.
 *
 * @param rows - Untrusted rows from a favorites, collection, series, or
 * uploads response.
 * @param kind - Source kind used to apply source-specific availability rules.
 * @returns Ordered validated candidates and the number of unavailable or
 * unsupported rows.
 */
function normalizeSourceRows(rows: unknown[], kind: BatchSource['kind']) {
  const items: BatchCandidate[] = []
  let unavailable = 0
  for (const row of rows) {
    const parsed = sourceRowSchema.safeParse(row)
    if (
      !parsed.success
      || (kind === 'favorites' && parsed.data.type !== 2)
      || (parsed.data.state !== undefined && parsed.data.state !== 0)
      || parsed.data.meta?.attribute === 156
      || parsed.data.title === '已失效视频'
      || parsed.data.title === '失效视频'
    ) {
      unavailable++
      continue
    }
    const candidate = batchCandidateSchema.safeParse({
      videoId: parsed.data.bvid,
      title: parsed.data.title,
      page: 1,
    })
    if (!candidate.success) {
      unavailable++
      continue
    }
    items.push(candidate.data)
  }
  return {
    items,
    unavailable,
  }
}

/**
 * Builds a validated batch page and prevents empty continuing pagination.
 *
 * @param source - Source descriptor used to normalize row availability.
 * @param title - Display title of the source.
 * @param rows - Untrusted rows returned for this page.
 * @param page - One-based page number just fetched.
 * @param total - Total entry count reported by the source API.
 * @param hasMore - Whether the API indicates another page should be fetched.
 * @returns A normalized page with available candidates, unavailable count, and
 * an optional next page number.
 * @throws {Error} If the source claims another page but returns no rows.
 * @throws {import('zod').ZodError} If the normalized page violates the batch
 *   page schema.
 */
function createBatchPage(
  source: BatchSource,
  title: string,
  rows: unknown[],
  page: number,
  total: number,
  hasMore: boolean,
): BatchPage {
  if (hasMore && !rows.length) {
    throw new Error('B 站返回了空分页，已停止读取；请稍后重新预览。')
  }
  return batchPageSchema.parse({
    title,
    ...normalizeSourceRows(rows, source.kind),
    total,
    ...(hasMore ? { nextPage: page + 1 } : {}),
  })
}

/**
 * Checks that an API page number, when present, matches the requested page.
 *
 * Returns no value when the returned number is absent or matches.
 *
 * @param actual - Page number returned by the API, or undefined if the
 * endpoint omits it.
 * @param requested - One-based page number requested by the caller.
 * @throws {Error} If the returned page number differs from the requested
 *   number.
 */
function validatePageNumber(actual: number | undefined, requested: number) {
  if (actual !== undefined && actual !== requested) {
    throw new Error('B 站返回的页码不一致，已停止读取；请重新预览。')
  }
}

/**
 * Loads one page with the browser session. Callers pace requests and
 * deduplicate across pages; a risk-control or permission error must stop
 * pagination.
 *
 * @param source - Validated favorites, collection/series, or owner-uploads
 * source descriptor.
 * @param page - One-based source page number, bounded by MAX_BATCH_ITEMS.
 * @param signal - Optional cancellation signal for API and signing requests.
 * @returns A promise resolving to one normalized source page and its optional
 * continuation.
 * @throws {import('zod').ZodError} If the source, page number, or response
 *   payload is invalid.
 * @throws {Error} If pagination repeats a different page or claims
 *   continuation with no rows.
 * @throws The signing or API request error; callers must stop pagination for
 *   permission or risk-control failures.
 */
export async function getBatchPage(
  source: BatchSource,
  page: number,
  signal?: AbortSignal,
): Promise<BatchPage> {
  batchSourceSchema.parse(source)
  pageNumberSchema.max(MAX_BATCH_ITEMS).parse(page)
  if (source.kind === 'favorites') {
    const data = favoritesPageSchema.parse(
      await requestApi(
        `/x/v3/fav/resource/list?media_id=${source.id}&pn=${page}&ps=${FAVORITES_PAGE_SIZE}`,
        signal,
      ),
    )
    return createBatchPage(
      source,
      data.info.title,
      data.medias || [],
      page,
      data.info.media_count,
      data.has_more,
    )
  }
  if (source.kind === 'collection' && source.collectionType === 'season') {
    const data = collectionPageSchema.parse(
      await requestApi(
        `/x/polymer/web-space/seasons_archives_list?mid=${source.mid}&season_id=${source.id}&page_num=${page}&page_size=${PAGE_SIZE}`,
        signal,
      ),
    )
    validatePageNumber(data.page.page_num, page)
    return createBatchPage(
      source,
      data.meta?.name || `合集 ${source.id}`,
      data.archives,
      page,
      data.page.total,
      page * data.page.page_size < data.page.total,
    )
  }
  if (source.kind === 'collection') {
    const data = seriesPageSchema.parse(
      await requestApi(
        `/x/series/archives?mid=${source.mid}&series_id=${source.id}&pn=${page}&ps=${PAGE_SIZE}`,
        signal,
      ),
    )
    validatePageNumber(data.page.num, page)
    return createBatchPage(
      source,
      `系列 ${source.id}`,
      data.archives,
      page,
      data.page.total,
      page * data.page.size < data.page.total,
    )
  }
  const query = signWbi(
    {
      mid: source.mid,
      pn: page,
      ps: PAGE_SIZE,
      order: 'pubdate',
      tid: 0,
      keyword: '',
      platform: 'web',
      web_location: '333.1387',
      order_avoided: 'true',
    },
    await getWbiKey(signal),
  )
  const data = uploadsPageSchema.parse(
    await requestApi(`/x/space/wbi/arc/search?${query}`, signal),
  )
  validatePageNumber(data.page.pn, page)
  return createBatchPage(
    source,
    `UP 主 ${source.mid} 的投稿`,
    data.list.vlist,
    page,
    data.page.count,
    page * data.page.ps < data.page.count,
  )
}
