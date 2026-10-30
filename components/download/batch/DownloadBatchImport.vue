<script lang="ts" setup>
import {
  ChevronRightIcon,
  FolderIcon,
  InfoIcon,
  ListPlusIcon,
  LoaderCircleIcon,
} from '@lucide/vue'
import { useBatchImport } from '~/composables/useBatchImport'
import { i18n } from '~/utils/i18n'
import BatchImportOptions from './BatchImportOptions.vue'
import BatchImportSteps from './BatchImportSteps.vue'
import BatchPreview from './BatchPreview.vue'
import BatchSourceForm from './BatchSourceForm.vue'

const {
  preferences,
  rows,
  sourceKind,
  sourceInput,
  quality,
  title,
  total,
  nextPage,
  isLoading,
  isAdding,
  isStopping,
  hasPreview,
  isPreviewStale,
  error: importError,
  notice,
  previewNotice,
  inputErrors,
  duplicateCount,
  unavailableCount,
  mode,
  kind,
  subtitleLanguage,
  skipCompleted,
  selectedCount,
  canAdd,
  canEdit,
  isSessionReady,
  isSavingSession,
  sessionError,
  sessionNotice,
  optionsSnapshot,
  reloadSession,
  resetBrokenSession,
  preview,
  loadNextPage,
  stopLoading,
  toggleRow,
  toggleAll,
  addSelected,
  stopAdding,
} = useBatchImport()
const { settings, isReady, isSaving, error: settingsError } = preferences
const isEditingSource = shallowRef(false)
const isSourceVisible = computed(
  () => isEditingSource.value || !hasPreview.value || isPreviewStale.value,
)
const sourceLabels = {
  get links() {
    return i18n.t('batchSourceForm.linkList')
  },
  get favorites() {
    return i18n.t('batchSourceForm.favorites')
  },
  get collection() {
    return i18n.t('batchSourceForm.collectionSeries')
  },
  get uploads() {
    return i18n.t('batchSourceForm.uploaderVideos')
  },
}
const step = computed(() =>
  isSourceVisible.value
    ? 1
    : isAdding.value || rows.value.some(row => row.status !== 'pending')
      ? 3
      : 2,
)
const sessionStatusLabel = computed(() => {
  if (!isSessionReady.value) {
    return sessionError.value
      ? i18n.t('downloadBatchImport.thePreviousSessionIsUnavailable')
      : i18n.t('downloadBatchImport.loadingPreviousSession')
  }
  if (isSavingSession.value) {
    return i18n.t('downloadBatchImport.savingDraftAndProgress')
  }
  return (
    sessionNotice.value
    || i18n.t(
      'downloadBatchImport.yourLatestSessionIsSavedAutomaticallyResumeManually',
    )
  )
})
const isLoadNextPageDisabled = computed(
  () =>
    isLoading.value || isAdding.value || isPreviewStale.value || !canEdit.value,
)
const loadNextPageLabel = computed(() => {
  if (isLoading.value) {
    return i18n.t('batchSourceForm.loading')
  }
  return (nextPage.value ?? 1) > 1
    ? i18n.t('downloadBatchImport.loadNextPage')
    : i18n.t('downloadPanel.reload')
})
const isOptionsDisabled = computed(
  () =>
    isAdding.value
    || !isReady.value
    || isSaving.value
    || !canEdit.value
    || !!optionsSnapshot.value,
)

async function previewSource() {
  await preview()
  if (hasPreview.value && !isPreviewStale.value && !importError.value) {
    isEditingSource.value = false
  }
}
</script>

<template>
  <section :aria-label="i18n.t('downloadWorkspace.batchImport')">
    <BatchImportSteps :step />
    <p
      class="mt-2.5 text-[11px] text-muted-foreground leading-4.5"
      role="status"
    >
      {{ sessionStatusLabel }}
    </p>
    <div
      v-if="sessionError"
      class="mt-3 rounded-lg bg-accent px-3 py-2.5"
    >
      <Alert
        class="text-[12px] text-destructive leading-5"
        variant="destructive"
      >
        <AlertDescription>
          {{ sessionError }}
        </AlertDescription>
      </Alert>
      <Button
        @click="reloadSession"
        :disabled="isAdding || isLoading || isSavingSession"
        variant="ghost"
        size="sm"
        type="button"
        class="mt-2 text-muted-foreground hover:text-primary text-[12px] disabled:opacity-55"
        >{{ i18n.t('downloadBatchImport.loadSavedSession') }}</Button
      >
      <template v-if="!isSessionReady">
        <p class="mt-2 text-[11px] text-muted-foreground leading-4.5">
          {{ i18n.t('downloadBatchImport.ifSavedDataIsCorruptClearTheBatch') }}
        </p>
        <Button
          @click="resetBrokenSession"
          :disabled="isSavingSession"
          variant="ghost"
          size="sm"
          type="button"
          class="mt-1.5 text-[12px] text-destructive hover:text-primary disabled:opacity-55"
          >{{ i18n.t('downloadBatchImport.clearCorruptSession') }}</Button
        >
      </template>
    </div>
    <div
      v-if="isSourceVisible"
      class="mt-4 rounded-xl border bg-background p-4 sm:p-5"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-medium">
          {{ i18n.t('downloadBatchImport.chooseImportSource') }}
        </h2>
        <Button
          @click="isEditingSource = false"
          v-if="hasPreview && !isPreviewStale"
          :disabled="isLoading || isAdding"
          variant="ghost"
          size="xs"
          >{{ i18n.t('downloadBatchImport.backToPreview') }}</Button
        >
      </div>
      <BatchSourceForm
        @preview="previewSource"
        @stop="stopLoading"
        v-model:source-kind="sourceKind"
        v-model:input="sourceInput"
        :disabled="isAdding || !canEdit"
        :loading="isLoading"
      />
    </div>
    <Alert
      v-if="importError || settingsError"
      class="mt-3 wrap-break-word text-[12px] text-destructive leading-5"
      variant="destructive"
    >
      <AlertDescription>
        {{ importError || settingsError }}
      </AlertDescription>
    </Alert>
    <template v-if="hasPreview">
      <p
        v-if="isPreviewStale"
        class="mt-3.5 rounded-lg bg-accent px-3 py-2.5 text-[12px] text-primary leading-5"
        role="status"
      >
        {{ i18n.t('downloadBatchImport.theSourceOrInputHasChangedThisIs') }}
      </p>
      <div class="mt-5 overflow-hidden rounded-xl border bg-background">
        <div class="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"
          >
            <FolderIcon
              class="size-5"
              aria-hidden="true"
            />
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="wrap-break-word text-base font-semibold">
              {{ title || i18n.t('downloadBatchImport.videoPreview') }}
            </h2>
            <Badge
              variant="secondary"
              class="mt-1 text-[11px] font-normal"
              >{{ sourceLabels[sourceKind] }}</Badge
            >
          </div>
          <Button
            @click="isEditingSource = true"
            v-if="!isSourceVisible"
            :disabled="isAdding || isLoading || !canEdit"
            variant="ghost"
            size="sm"
            class="text-xs text-muted-foreground"
            >{{ i18n.t('downloadBatchImport.changeSource')
            }}<ChevronRightIcon
              class="size-4"
              aria-hidden="true"
          /></Button>
        </div>
        <div
          class="flex flex-wrap gap-x-4 gap-y-2 border-y px-4 py-3 text-xs text-muted-foreground sm:px-5"
          role="status"
        >
          <span
            >{{ i18n.t('downloadBatchImport.previewedCount', rows.length)
            }}<span v-if="total !== undefined">{{
              i18n.t('downloadBatchImport.inSource', [total])
            }}</span></span
          >
          <span v-if="duplicateCount">{{
            i18n.t('downloadBatchImport.duplicatesCombined', duplicateCount)
          }}</span>
          <span v-if="unavailableCount">{{
            i18n.t(
              'downloadBatchImport.unavailableVideosSkipped',
              unavailableCount,
            )
          }}</span>
        </div>
        <Collapsible
          v-if="inputErrors.length"
          class="m-4 rounded-lg bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          <CollapsibleTrigger
            class="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {{
              i18n.t(
                'downloadBatchImport.linesCouldNotBeRecognizedOtherValidLines',
                inputErrors.length,
              )
            }}</CollapsibleTrigger
          >
          <CollapsibleContent>
            <ul class="mt-2 max-h-40 overflow-y-auto space-y-1.5">
              <li
                v-for="item in inputErrors"
                :key="item.line"
                class="break-all leading-4.75"
              >
                {{
                  i18n.t('downloadBatchImport.line', [
                    item.line,
                    item.input,
                    item.error,
                  ])
                }}
              </li>
            </ul>
          </CollapsibleContent>
        </Collapsible>
        <BatchPreview
          @toggle="toggleRow"
          @toggle-all="toggleAll"
          v-if="rows.length"
          :rows
          :disabled="isAdding || isLoading || !canEdit"
        />
        <p
          v-else-if="!isLoading"
          class="px-5 py-8 text-center text-xs text-muted-foreground"
        >
          {{ i18n.t('downloadBatchImport.noVideosToAddCheckTheSourceOr') }}
        </p>
      </div>
      <p
        v-if="previewNotice"
        class="mt-2.5 text-[12px] text-muted-foreground leading-5"
        role="status"
      >
        {{ previewNotice }}
      </p>
      <div
        v-if="nextPage || isLoading"
        class="mt-3 flex flex-wrap items-center gap-3"
      >
        <Button
          @click="loadNextPage"
          :disabled="isLoadNextPageDisabled"
          variant="ghost"
          size="sm"
          type="button"
          class="text-muted-foreground hover:text-primary text-[12px] disabled:opacity-55"
        >
          {{ loadNextPageLabel }}
        </Button>
        <Button
          @click="stopLoading"
          v-if="isLoading"
          variant="outline"
          size="sm"
          >{{ i18n.t('batchSourceForm.stopLoading') }}</Button
        >
        <span class="text-[11px] text-muted-foreground">{{
          i18n.t('downloadBatchImport.loadOnePageAtATimeAndReview')
        }}</span>
      </div>
      <template v-if="rows.length">
        <BatchImportOptions
          v-model:quality="quality"
          v-model:kind="kind"
          v-model:subtitle-language="subtitleLanguage"
          v-model:mode="mode"
          v-model:skip-completed="skipCompleted"
          :disabled="isOptionsDisabled"
        />
        <p
          v-if="optionsSnapshot"
          class="mt-2.5 text-[11px] text-muted-foreground leading-4.5"
        >
          {{
            i18n.t(
              'downloadBatchImport.thisSessionUsesTheDownloadOptionsFilenameTemplate',
              [optionsSnapshot.filenameTemplate],
            )
          }}
        </p>
        <div
          class="sticky bottom-0 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4 shadow-sm sm:p-5"
        >
          <div class="min-w-0">
            <p
              class="text-sm font-medium"
              aria-live="polite"
            >
              {{
                i18n.t('downloadBatchImport.selectedVideoCount', selectedCount)
              }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ i18n.t('downloadBatchImport.saveToBilibiliFolder') }}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              @click="addSelected"
              :disabled="!canAdd"
              type="button"
            >
              <component
                :is="isAdding ? LoaderCircleIcon : ListPlusIcon"
                :class="{ 'animate-spin motion-reduce:animate-none': isAdding }"
                aria-hidden="true"
                class="size-4 shrink-0"
              />
              {{
                isAdding
                  ? i18n.t('downloadPanel.addingToQueue')
                  : i18n.t(
                      'downloadBatchImport.addSelectedVideos',
                      selectedCount,
                    )
              }}
            </Button>
            <Button
              @click="stopAdding"
              v-if="isAdding"
              :disabled="isStopping"
              variant="ghost"
              size="sm"
              type="button"
              class="text-muted-foreground hover:text-primary text-[12px] disabled:opacity-55"
            >
              {{
                isStopping
                  ? i18n.t('downloadBatchImport.waitingForTheCurrentVideo')
                  : i18n.t('downloadBatchImport.stopAfterTheCurrentVideo')
              }}
            </Button>
          </div>
        </div>
        <p class="mt-2.25 text-[11px] text-muted-foreground leading-4.5">
          <InfoIcon
            class="mr-1 inline size-4"
            aria-hidden="true"
          />{{
            i18n.t(
              'downloadBatchImport.keepThisPageOpenDuringImportAndDownloads',
            )
          }}
        </p>
        <p
          v-if="settings.isPaused"
          class="mt-2.25 text-[12px] text-primary"
          role="status"
        >
          {{ i18n.t('downloadBatchImport.theQueueIsPausedNewTasksWillWait') }}
        </p>
        <p
          v-if="notice"
          class="mt-3 text-[12px] text-primary leading-5"
          role="status"
        >
          {{ notice }}
        </p>
      </template>
    </template>
  </section>
</template>
