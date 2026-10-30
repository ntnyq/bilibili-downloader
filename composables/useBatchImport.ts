import { batchPageSchema, MAX_BATCH_ITEMS } from '~/types/batch'
import {
  batchSessionAddReplySchema,
  batchSessionDataSchema,
  batchSessionSaveResultSchema,
  batchSessionSchema,
} from '~/types/batchSession'
import { parseBatchLinks, parseBatchSource } from '~/utils/bilibili/batch'
import {
  createBatchSessionData,
  restoreBatchSession,
} from '~/utils/downloads/batch/session'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import { useDownloadSettings } from './useDownloadSettings'
import type { BatchCandidate } from '~/types/batch'
import type {
  BatchImportOptions,
  BatchImportRow,
  BatchSession,
  BatchSessionData,
  BatchSourceKind,
} from '~/types/batchSession'

export type { BatchImportRow, BatchSourceKind } from '~/types/batchSession'

export function useBatchImport() {
  const preferences = useDownloadSettings()
  const session = shallowRef(createBatchSessionData())
  const revision = shallowRef<number | null>(null)
  const isSessionReady = shallowRef(false)
  const isSavingSession = shallowRef(false)
  const hasConflict = shallowRef(false)
  const sessionError = shallowRef('')
  const sessionNotice = shallowRef('')
  const isLoading = shallowRef(false)
  const isAdding = shallowRef(false)
  const isStopping = shallowRef(false)
  const error = shallowRef('')
  const notice = shallowRef('')
  let requestId = 0
  let disposed = false
  let dirty = false
  let isPreviewing = false
  let shouldSeedQuality = true
  let saveTask: Promise<boolean> | undefined

  const rows = computed(() => session.value.rows)
  const sourceKind = computed({
    get: () => session.value.sourceKind,
    set(value: BatchSourceKind) {
      return updateSession({
        sourceKind: value,
        isPreviewStale: session.value.hasPreview,
      })
    },
  })
  const sourceInput = computed({
    get: () => session.value.drafts[session.value.sourceKind],
    set(value: string) {
      return updateSession({
        drafts: { ...session.value.drafts, [session.value.sourceKind]: value },
        isPreviewStale: session.value.hasPreview,
      })
    },
  })
  const optionsSnapshot = computed(() => session.value.optionsSnapshot)
  const mode = optionModel('mode')
  const kind = optionModel('kind')
  const quality = optionModel('quality')
  const subtitleLanguage = optionModel('subtitleLanguage')
  const skipCompleted = optionModel('skipCompleted')
  const selectedCount = computed(
    () => rows.value.filter(row => row.selected).length,
  )
  const canEdit = computed(() => isSessionReady.value && !hasConflict.value)
  const canAdd = computed(
    () =>
      selectedCount.value > 0
      && canEdit.value
      && !isLoading.value
      && !isAdding.value
      && !session.value.isPreviewStale
      && preferences.isReady.value
      && !preferences.isSaving.value,
  )

  function optionModel<Key extends keyof BatchImportOptions>(key: Key) {
    return computed({
      get: () => session.value.options[key],
      set(value: BatchImportOptions[Key]) {
        if (!session.value.optionsSnapshot) {
          if (key === 'quality') {
            shouldSeedQuality = false
          }
          updateSession({ options: { ...session.value.options, [key]: value } })
        }
      },
    })
  }

  function updateSession(patch: Partial<BatchSessionData>) {
    session.value = { ...session.value, ...patch }
    dirty = true
    flushSession()
  }

  function applySession(value: BatchSession, recover = false) {
    revision.value = value.revision
    session.value = recover
      ? restoreBatchSession(value)
      : batchSessionDataSchema.parse(value)
    dirty = false
  }

  function flushSession(): Promise<boolean> {
    if (saveTask) {
      return saveTask
    }
    saveTask = saveSession().finally(() => {
      saveTask = undefined
    })
    return saveTask
  }

  async function saveSession(): Promise<boolean> {
    if (!isSessionReady.value || hasConflict.value || disposed) {
      return false
    }
    isSavingSession.value = true
    try {
      while (dirty) {
        if (disposed) {
          return false
        }
        const draft = session.value
        const parsed = batchSessionDataSchema.safeParse(draft)
        if (!parsed.success) {
          throw new Error(
            parsed.error.issues[0]?.message
              || '批量会话无法保存，请减少输入内容。',
          )
        }
        const result = await sendDownloadMessage(
          {
            type: 'batch.session.save',
            session: parsed.data,
            expectedRevision: revision.value,
          },
          batchSessionSaveResultSchema,
        )
        if (result.conflict || !result.session) {
          hasConflict.value = true
          throw new Error(
            '其他下载中心已修改批量会话。请载入已保存的会话后继续。',
          )
        }
        revision.value = result.session.revision
        if (session.value === draft) {
          applySession(result.session)
        }
        sessionError.value = ''
      }
      return !disposed
    } catch (error_) {
      sessionError.value = getErrorMessage(error_)
      return false
    } finally {
      isSavingSession.value = false
    }
  }

  async function reloadSession() {
    if (isLoading.value || isAdding.value || isSavingSession.value) {
      return
    }
    isSessionReady.value = false
    sessionError.value = ''
    try {
      const saved = await sendDownloadMessage(
        { type: 'batch.session.get' },
        batchSessionSchema.nullable(),
      )
      if (disposed) {
        return
      }
      if (saved) {
        shouldSeedQuality = false
        applySession(saved, true)
        sessionNotice.value =
          '已恢复上次的草稿、预览和进度。请手动读取下一页或继续加入；不会自动请求来源。'
      } else {
        shouldSeedQuality = true
        session.value = createBatchSessionData()
        revision.value = null
        dirty = false
        sessionNotice.value = ''
      }
      hasConflict.value = false
      isSessionReady.value = true
      seedQuality()
      error.value = ''
    } catch (error_) {
      sessionError.value = getErrorMessage(error_)
    }
  }

  function seedQuality() {
    if (
      shouldSeedQuality
      && isSessionReady.value
      && preferences.isReady.value
    ) {
      shouldSeedQuality = false
      session.value = {
        ...session.value,
        options: {
          ...session.value.options,
          quality: preferences.settings.value.quality,
        },
      }
      if (dirty || revision.value !== null) {
        updateSession({})
      }
    }
  }

  watch(preferences.isReady, seedQuality)

  async function resetBrokenSession() {
    if (isSessionReady.value || isSavingSession.value) {
      return
    }
    isSavingSession.value = true
    try {
      const saved = await sendDownloadMessage(
        { type: 'batch.session.reset' },
        batchSessionSchema,
      )
      if (!disposed) {
        applySession(saved, true)
        hasConflict.value = false
        isSessionReady.value = true
        sessionError.value = ''
        sessionNotice.value =
          '已清除损坏的批量会话，可以重新预览。下载任务未受影响。'
        shouldSeedQuality = true
      }
    } catch (error_) {
      sessionError.value = getErrorMessage(error_)
    } finally {
      isSavingSession.value = false
    }
    seedQuality()
  }

  function resetPreview() {
    const next = createBatchSessionData()
    session.value = {
      ...next,
      source: undefined,
      total: undefined,
      nextPage: undefined,
      optionsSnapshot: undefined,
      drafts: session.value.drafts,
      sourceKind: session.value.sourceKind,
      options: {
        ...session.value.options,
        filenameTemplate: preferences.settings.value.filenameTemplate,
        folderMode: preferences.settings.value.folderMode,
      },
      hasPreview: true,
    }
    notice.value = ''
    sessionNotice.value = ''
  }

  function appendItems(items: BatchCandidate[]) {
    const keys = new Set(rows.value.map(row => row.key))
    const appended: BatchImportRow[] = []
    let duplicateCount = session.value.duplicateCount
    for (const item of items) {
      const key = `${item.videoId}:${item.page}`
      if (keys.has(key)) {
        duplicateCount++
        continue
      }
      if (rows.value.length + appended.length >= MAX_BATCH_ITEMS) {
        break
      }
      keys.add(key)
      appended.push({
        key,
        item,
        selected: true,
        status: 'pending',
        outcome: '',
      })
    }
    return {
      rows: [...rows.value, ...appended],
      duplicateCount,
      appended: appended.length,
    }
  }

  async function preview() {
    if (
      !canEdit.value
      || isLoading.value
      || isAdding.value
      || isPreviewing
      || disposed
    ) {
      return
    }
    isPreviewing = true
    error.value = ''
    try {
      if (!(await flushSession()) || !canEdit.value || disposed) {
        return
      }
      const input = sourceInput.value
      if (sourceKind.value === 'links') {
        const parsed = parseBatchLinks(input)
        if (!parsed.items.length && session.value.hasPreview) {
          updateSession({ inputErrors: parsed.errors, isPreviewStale: true })
          error.value = '没有识别到有效视频，请检查输入后重新预览。'
          return
        }
        resetPreview()
        const appended = appendItems(parsed.items)
        updateSession({
          title: '链接列表',
          inputErrors: parsed.errors,
          rows: appended.rows,
          duplicateCount: parsed.duplicateCount + appended.duplicateCount,
        })
        await flushSession()
        return
      }
      const parsed = parseBatchSource(sourceKind.value, input)
      resetPreview()
      updateSession({ source: parsed, title: '来源预览', nextPage: 1 })
      if (await flushSession()) {
        await loadNextPage()
      }
    } catch (error_) {
      if (!disposed) {
        error.value = getErrorMessage(error_)
      }
    } finally {
      isPreviewing = false
    }
  }

  async function loadNextPage() {
    if (
      !session.value.source
      || !session.value.nextPage
      || !canEdit.value
      || isLoading.value
      || isAdding.value
      || session.value.isPreviewStale
      || disposed
      || !(await flushSession())
      || isLoading.value
      || isAdding.value
      || !canEdit.value
      || session.value.isPreviewStale
      || disposed
    ) {
      return
    }
    const id = ++requestId
    const page = session.value.nextPage
    const source = session.value.source
    if (!page || !source) {
      return
    }
    isLoading.value = true
    error.value = ''
    updateSession({ previewNotice: '' })
    try {
      const result = await sendDownloadMessage(
        { type: 'batch.page', source, page },
        batchPageSchema,
      )
      if (disposed || id !== requestId) {
        return
      }
      const appended = appendItems(result.items)
      let nextPage = result.nextPage
      let previewNotice = ''
      if (appended.rows.length >= MAX_BATCH_ITEMS) {
        nextPage = undefined
        previewNotice = `本次最多预览 ${MAX_BATCH_ITEMS} 个视频，已停止读取。`
      } else if (
        result.nextPage
        && ((!appended.appended
          && (result.items.length > 0 || !result.unavailable))
          || result.nextPage <= page)
      ) {
        nextPage = undefined
        previewNotice =
          '这一页没有继续提供新视频，已停止读取。已预览的视频仍可加入队列。'
      }
      updateSession({
        rows: appended.rows,
        duplicateCount: appended.duplicateCount,
        title: result.title,
        total: result.total,
        unavailableCount: session.value.unavailableCount + result.unavailable,
        nextPage,
        previewNotice,
      })
      await flushSession()
    } catch (error_) {
      if (!disposed && id === requestId) {
        error.value = getErrorMessage(error_)
      }
    } finally {
      if (!disposed && id === requestId) {
        isLoading.value = false
      }
    }
  }

  function stopLoading() {
    if (isLoading.value) {
      requestId++
      isLoading.value = false
      updateSession({
        previewNotice: '已停止读取，保留先前的预览。可以继续读取这一页。',
      })
    }
  }

  function toggleRow(key: string) {
    if (!canEdit.value || isAdding.value || isLoading.value) {
      return
    }
    updateSession({
      rows: rows.value.map(row =>
        row.key === key
        && !row.receipt
        && (row.status === 'pending' || row.status === 'failed')
          ? { ...row, selected: !row.selected }
          : row,
      ),
    })
  }

  function toggleAll() {
    if (!canEdit.value || isAdding.value || isLoading.value) {
      return
    }
    const available = rows.value.filter(
      row =>
        !row.receipt && (row.status === 'pending' || row.status === 'failed'),
    )
    const selected = !available.every(row => row.selected)
    updateSession({
      rows: rows.value.map(row =>
        available.includes(row) ? { ...row, selected } : row,
      ),
    })
  }

  async function addSelected() {
    if (
      !canAdd.value
      || isPreviewing
      || disposed
      || !(await flushSession())
      || !canAdd.value
      || disposed
    ) {
      return
    }
    const selected = rows.value.filter(row => row.selected)
    const options = session.value.optionsSnapshot || {
      ...session.value.options,
      filenameTemplate: preferences.settings.value.filenameTemplate,
      folderMode: preferences.settings.value.folderMode,
    }
    isAdding.value = true
    isStopping.value = false
    error.value = ''
    notice.value = ''
    updateSession({ optionsSnapshot: options, options })
    let finished = 0
    let added = 0
    let skipped = 0
    try {
      for (const row of selected) {
        if (disposed || isStopping.value) {
          break
        }
        updateSession({
          rows: rows.value.map(item =>
            item.key === row.key
              ? { ...item, status: 'adding', outcome: '正在加入…' }
              : item,
          ),
        })
        if (!(await flushSession()) || revision.value === null) {
          break
        }
        try {
          const reply = await sendDownloadMessage(
            {
              type: 'batch.add',
              item: row.item,
              ...options,
              sessionId: session.value.id,
              rowKey: row.key,
              expectedRevision: revision.value,
            },
            batchSessionAddReplySchema,
          )
          if (disposed) {
            return
          }
          applySession(reply.session)
          added += reply.result.added
          skipped += reply.result.skipped
          finished++
          notice.value = `已处理 ${finished} / ${selected.length} 个视频：加入 ${added} 个任务，跳过 ${skipped} 个任务。`
          if (reply.result.shouldStop) {
            error.value =
              reply.result.error || '已停止加入，请检查下载队列后继续。'
            break
          }
        } catch (error_) {
          if (!disposed) {
            // The commit may already exist. Read its durable receipt before another attempt.
            hasConflict.value = true
            sessionError.value = `本次响应未确认：${getErrorMessage(error_)} 请载入已保存的会话后手动继续。`
          }
          break
        }
      }
    } finally {
      if (!disposed) {
        notice.value = `${finished < selected.length ? '已停止加入' : '本次处理完成'}：加入 ${added} 个任务，跳过 ${skipped} 个任务。未处理的视频保留勾选，已加入的任务继续下载。`
        isAdding.value = false
        isStopping.value = false
      }
    }
  }

  function stopAdding() {
    if (isAdding.value) {
      isStopping.value = true
      notice.value =
        '正在等待当前视频处理完成；随后停止加入，已加入的任务继续下载。'
    }
  }

  reloadSession()
  onScopeDispose(() => {
    disposed = true
    requestId++
  })

  return {
    preferences,
    rows,
    sourceKind,
    sourceInput,
    quality,
    title: computed(() => session.value.title),
    total: computed(() => session.value.total),
    nextPage: computed(() => session.value.nextPage),
    hasPreview: computed(() => session.value.hasPreview),
    isPreviewStale: computed(() => session.value.isPreviewStale),
    previewNotice: computed(() => session.value.previewNotice),
    inputErrors: computed(() => session.value.inputErrors),
    duplicateCount: computed(() => session.value.duplicateCount),
    unavailableCount: computed(() => session.value.unavailableCount),
    isLoading,
    isAdding,
    isStopping,
    error,
    notice,
    isSessionReady,
    isSavingSession,
    sessionError,
    sessionNotice,
    hasConflict,
    optionsSnapshot,
    canEdit,
    reloadSession,
    resetBrokenSession,
    mode,
    kind,
    subtitleLanguage,
    skipCompleted,
    selectedCount,
    canAdd,
    preview,
    loadNextPage,
    stopLoading,
    toggleRow,
    toggleAll,
    addSelected,
    stopAdding,
  }
}
