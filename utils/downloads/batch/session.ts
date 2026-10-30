import {
  batchImportOptionsSchema,
  batchSessionDataSchema,
  batchSessionSchema,
} from '~/types/batchSession'
import { downloadSettingsSchema } from '~/types/download'
import type {
  BatchAddResult,
  BatchImportOptions,
  BatchImportRow,
  BatchSession,
  BatchSessionData,
  BatchSessionSaveResult,
} from '~/types/batchSession'

export const BATCH_SESSION_STORAGE_KEY = 'downloadBatchSessionV1'

/**
 * Creates an empty, uniquely identified batch-import draft with default
 * settings.
 *
 * @returns A fresh links-source draft with no preview, rows, receipts, or
 * revision metadata.
 */
export function createBatchSessionData(): BatchSessionData {
  const settings = downloadSettingsSchema.parse({})
  return {
    id: crypto.randomUUID(),
    sourceKind: 'links',
    drafts: { links: '', favorites: '', collection: '', uploads: '' },
    title: '',
    rows: [],
    options: {
      mode: 'current',
      kind: 'video',
      subtitleLanguage: 'auto',
      skipCompleted: true,
      quality: settings.quality,
      filenameTemplate: settings.filenameTemplate,
      folderMode: settings.folderMode,
    },
    hasPreview: false,
    isPreviewStale: false,
    previewNotice: '',
    inputErrors: [],
    duplicateCount: 0,
    unavailableCount: 0,
  }
}

/**
 * Restore only local state; an interrupted row needs an explicit manual retry.
 *
 * @param session - Persisted session whose durable receipts and selection
 * state must be preserved.
 * @returns Validated draft data with interrupted uncommitted rows reset to
 * pending; no work is resumed automatically.
 * @throws {import('zod').ZodError} If restored session data violates the draft
 *   schema.
 */
export function restoreBatchSession(session: BatchSession): BatchSessionData {
  return batchSessionDataSchema.parse({
    ...session,
    rows: session.rows.map(row =>
      row.status === 'adding' && !row.receipt
        ? { ...row, status: 'pending', outcome: '上次处理已中断，可手动继续。' }
        : row,
    ),
  })
}

/**
 * Called inside the background queue lock. Compare-and-swap protects other
 * tabs.
 *
 * @param current - Currently stored session, or null before the first save.
 * @param input - Submitted draft; existing committed rows and frozen options
 * take precedence.
 * @param expectedRevision - Revision observed by the caller, or null when
 * expecting no saved session.
 * @param now - Update timestamp in milliseconds; defaults to Date.now().
 * @returns The current session with conflict=true on a revision mismatch,
 * otherwise a validated next revision for the caller to persist.
 * @throws {import('zod').ZodError} If the submitted draft or resulting saved
 *   session is invalid.
 * @throws {Error} If an update to the same session removes a row with a
 *   durable receipt.
 */
export function saveBatchSession(
  current: BatchSession | null,
  input: BatchSessionData,
  expectedRevision: number | null,
  now = Date.now(),
): BatchSessionSaveResult {
  if ((current?.revision ?? null) !== expectedRevision) {
    return {
      session: current,
      conflict: true,
    }
  }
  const data = batchSessionDataSchema.parse(input)
  if (current?.id === data.id) {
    if (current.optionsSnapshot) {
      data.optionsSnapshot = current.optionsSnapshot
      data.options = current.optionsSnapshot
    }
    // A stale client must never erase a durable receipt, even when it knows the revision.
    const committed = new Map(
      current.rows.filter(row => row.receipt).map(row => [row.key, row]),
    )
    if (
      [...committed.keys()].some(key => !data.rows.some(row => row.key === key))
    ) {
      throw new Error('已加入的视频不能从当前会话移除，请开始新的预览。')
    }
    data.rows = data.rows.map(
      row => committed.get(row.key) || { ...row, receipt: undefined },
    )
  } else {
    // Receipts can only originate from a background queue commit.
    data.rows = data.rows.map(row => ({
      ...row,
      receipt: undefined,
    }))
  }
  return {
    session: batchSessionSchema.parse({
      ...data,
      revision: (current?.revision ?? 0) + 1,
      updatedAt: now,
    }),
    conflict: false,
  }
}

export interface BatchSessionRowRequest {
  sessionId: string
  rowKey: string
  expectedRevision: number
  item: BatchImportRow['item']
  mode: BatchImportOptions['mode']
  quality: BatchImportOptions['quality']
  kind: BatchImportOptions['kind']
  subtitleLanguage: BatchImportOptions['subtitleLanguage']
  skipCompleted: boolean
  filenameTemplate: string
  folderMode: BatchImportOptions['folderMode']
}

/**
 * Check receipts before revision and network access, including after a lost
 * reply.
 *
 * @param session - Currently persisted import session, or null if no session
 * exists.
 * @param request - Submitted session/row identity, expected revision, source
 * item, and frozen options.
 * @returns The existing row immediately if it has a receipt, otherwise the
 * selected row after revision and snapshot validation.
 * @throws {Error} If the session/row was replaced, its revision changed, or
 *   selection/options are stale.
 * @throws {import('zod').ZodError} If submitted batch options are invalid
 *   during snapshot comparison.
 */
export function getBatchSessionRow(
  session: BatchSession | null,
  request: BatchSessionRowRequest,
): BatchImportRow {
  const row =
    session?.id === request.sessionId
      ? session.rows.find(item => item.key === request.rowKey)
      : undefined
  if (!session || !row) {
    throw new Error('批量会话已被替换，请重新载入已保存的会话。')
  }
  if (row.receipt) {
    return row
  }
  if (session.revision !== request.expectedRevision) {
    throw new Error('批量会话已在其他页面更新，请重新载入已保存的会话。')
  }
  const options = session.optionsSnapshot
  if (
    !options
    || !row.selected
    || session.isPreviewStale
    || JSON.stringify(row.item) !== JSON.stringify(request.item)
    || JSON.stringify(options)
      !== JSON.stringify(batchImportOptionsSchema.parse(request))
  ) {
    throw new Error('批量导入选项已变化，请重新载入已保存的会话。')
  }
  return row
}

/**
 * Finds a committed row for the same video when one receipt covers every part.
 *
 * @param session - Session containing the current row and any previously
 * committed source aliases.
 * @param rowKey - Key of the row whose video may already have an all-parts or
 * cover receipt.
 * @param bvid - Optional canonical BV identifier for matching av/BV aliases
 * after metadata resolution.
 * @returns A different row with a successful receipt for the same video, or
 * undefined if no reusable receipt exists.
 */
export function findBatchSessionReceiptRow(
  session: BatchSession,
  rowKey: string,
  bvid?: string,
): BatchImportRow | undefined {
  const options = session.optionsSnapshot
  const current = session.rows.find(row => row.key === rowKey)
  if (
    !current
    || !options
    || (options.mode !== 'all' && options.kind !== 'cover')
  ) {
    return
  }
  return session.rows.find(
    row =>
      row.key !== rowKey
      && row.receipt
      && !row.receipt.error
      && (row.item.videoId === current.item.videoId
        || (bvid && row.receipt.bvid === bvid)),
  )
}

/**
 * Persist this return value with queue changes in the same storage.local.set
 * call. Zero-commit failures remain retryable and do not receive a receipt.
 *
 * @param session - Current session to advance after an atomic queue operation.
 * @param rowKey - Key of the row that produced the queue result.
 * @param result - Added/skipped counts, canonical identity, and any partial or
 * failed outcome.
 * @param now - Commit timestamp in milliseconds; defaults to Date.now().
 * @returns A validated next session revision with the row deselected and a
 * receipt only for success or partial commitment.
 * @throws {import('zod').ZodError} If the updated session or result receipt
 *   violates its persistence schema.
 */
export function commitBatchSessionResult(
  session: BatchSession,
  rowKey: string,
  result: BatchAddResult,
  now = Date.now(),
): BatchSession {
  const counts = `加入 ${result.added} 个 · 跳过 ${result.skipped} 个`
  return batchSessionSchema.parse({
    ...session,
    revision: session.revision + 1,
    updatedAt: now,
    rows: session.rows.map(row =>
      row.key === rowKey
        ? {
            ...row,
            selected: false,
            status: result.error
              ? result.added || result.skipped
                ? 'partial'
                : 'failed'
              : 'done',
            outcome: result.error ? `${counts} · ${result.error}` : counts,
            receipt:
              !result.error || result.added || result.skipped
                ? result
                : undefined,
          }
        : row,
    ),
  })
}
