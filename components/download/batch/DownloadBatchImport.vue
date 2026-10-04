<script lang="ts" setup>
import {
  ChevronRightIcon,
  FolderIcon,
  InfoIcon,
  ListPlusIcon,
  LoaderCircleIcon,
} from '@lucide/vue'
import { useBatchImport } from '~/composables/useBatchImport'
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
  links: '链接列表',
  favorites: '收藏夹',
  collection: '合集 / 系列',
  uploads: 'UP 投稿',
}
const step = computed(() =>
  isSourceVisible.value
    ? 1
    : isAdding.value || rows.value.some(row => row.status !== 'pending')
      ? 3
      : 2,
)

async function previewSource() {
  await preview()
  if (hasPreview.value && !isPreviewStale.value && !importError.value) {
    isEditingSource.value = false
  }
}
</script>

<template>
  <section aria-label="批量导入">
    <BatchImportSteps :step />
    <p
      class="mt-[10px] text-[11px] text-muted-foreground leading-[18px]"
      role="status"
    >
      {{
        isSessionReady
          ? isSavingSession
            ? '正在保存草稿和进度…'
            : sessionNotice || '自动保存最近一次会话；刷新或关闭后可手动继续。'
          : sessionError
            ? '上次会话暂不可用。'
            : '正在载入上次会话…'
      }}
    </p>
    <div
      v-if="sessionError"
      class="mt-[12px] rounded-[8px] bg-accent px-[12px] py-[10px]"
    >
      <Alert
        class="text-[12px] text-destructive leading-[20px]"
        variant="destructive"
        ><AlertDescription>
          {{ sessionError }}
        </AlertDescription></Alert
      >
      <Button
        @click="reloadSession"
        :disabled="isAdding || isLoading || isSavingSession"
        variant="ghost"
        size="sm"
        type="button"
        class="mt-[8px] text-muted-foreground hover:text-primary text-[12px] disabled:opacity-55"
      >
        载入已保存的会话
      </Button>
      <template v-if="!isSessionReady">
        <p class="mt-[8px] text-[11px] text-muted-foreground leading-[18px]">
          如果保存的数据已损坏，可清除批量草稿和预览后重新开始。已加入的下载任务会保留。
        </p>
        <Button
          @click="resetBrokenSession"
          :disabled="isSavingSession"
          variant="ghost"
          size="sm"
          type="button"
          class="mt-[6px] text-muted-foreground hover:text-primary text-[12px] text-destructive disabled:opacity-55"
        >
          清除损坏的会话
        </Button>
      </template>
    </div>
    <div
      v-if="isSourceVisible"
      class="mt-4 rounded-xl border bg-background p-4 sm:p-5"
    >
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-medium">选择导入来源</h2>
        <Button
          @click="isEditingSource = false"
          v-if="hasPreview && !isPreviewStale"
          :disabled="isLoading || isAdding"
          variant="ghost"
          size="xs"
          >返回预览</Button
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
      class="mt-[12px] break-words text-[12px] text-destructive leading-[20px]"
      variant="destructive"
      ><AlertDescription>
        {{ importError || settingsError }}
      </AlertDescription></Alert
    >
    <template v-if="hasPreview">
      <p
        v-if="isPreviewStale"
        class="mt-[14px] rounded-[8px] bg-accent px-[12px] py-[10px] text-[12px] text-primary leading-[20px]"
        role="status"
      >
        来源或输入已修改，下方仍是上一次预览。请点击「预览列表」更新后再加入队列。
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
            <h2 class="break-words text-base font-semibold">
              {{ title || '视频预览' }}
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
            >更换来源<ChevronRightIcon
              class="size-4"
              aria-hidden="true"
          /></Button>
        </div>
        <div
          class="flex flex-wrap gap-x-4 gap-y-2 border-y px-4 py-3 text-xs text-muted-foreground sm:px-5"
          role="status"
        >
          <span
            >已预览
            <strong class="font-medium text-primary">{{ rows.length }}</strong>
            个<span v-if="total !== undefined">
              / 来源共 {{ total }} 个</span
            ></span
          >
          <span v-if="duplicateCount">合并重复 {{ duplicateCount }} 条</span>
          <span v-if="unavailableCount"
            >跳过失效 {{ unavailableCount }} 个</span
          >
        </div>
        <Collapsible
          v-if="inputErrors.length"
          class="m-4 rounded-lg bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          <CollapsibleTrigger
            class="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {{ inputErrors.length }} 行未能识别，其他有效行仍可导入
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul class="mt-[8px] max-h-[160px] overflow-y-auto space-y-[6px]">
              <li
                v-for="item in inputErrors"
                :key="item.line"
                class="break-all leading-[19px]"
              >
                第 {{ item.line }} 行：{{ item.input }} — {{ item.error }}
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
          暂无可加入的视频，请检查来源或输入内容。
        </p>
      </div>
      <p
        v-if="previewNotice"
        class="mt-[10px] text-[12px] text-muted-foreground leading-[20px]"
        role="status"
      >
        {{ previewNotice }}
      </p>
      <div
        v-if="nextPage || isLoading"
        class="mt-[12px] flex flex-wrap items-center gap-[12px]"
      >
        <Button
          @click="loadNextPage"
          :disabled="isLoading || isAdding || isPreviewStale || !canEdit"
          variant="ghost"
          size="sm"
          type="button"
          class="text-muted-foreground hover:text-primary text-[12px] disabled:opacity-55"
        >
          {{
            isLoading
              ? '正在读取…'
              : (nextPage ?? 1) > 1
                ? '读取下一页'
                : '重新读取'
          }}
        </Button>
        <Button
          @click="stopLoading"
          v-if="isLoading"
          variant="outline"
          size="sm"
          >停止读取</Button
        >
        <span class="text-[11px] text-muted-foreground"
          >每次只读取一页，确认后再继续。</span
        >
      </div>
      <template v-if="rows.length">
        <BatchImportOptions
          v-model:quality="quality"
          v-model:kind="kind"
          v-model:subtitle-language="subtitleLanguage"
          v-model:mode="mode"
          v-model:skip-completed="skipCompleted"
          :disabled="
            isAdding || !isReady || isSaving || !canEdit || !!optionsSnapshot
          "
        />
        <p
          v-if="optionsSnapshot"
          class="mt-[10px] text-[11px] text-muted-foreground leading-[18px]"
        >
          本会话沿用首次加入时的下载选项、文件名模板「{{
            optionsSnapshot.filenameTemplate
          }}」和目录设置。
          如需更改选项，点击「更换来源」，重新预览以开始新会话。
        </p>
        <div
          class="sticky bottom-0 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4 shadow-sm sm:p-5"
        >
          <div class="min-w-0">
            <p
              class="text-sm font-medium"
              aria-live="polite"
            >
              已选择
              <span class="text-primary">{{ selectedCount }}</span> 个视频
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              保存到 Bilibili 文件夹
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
                isAdding ? '正在加入队列…' : `加入所选 ${selectedCount} 个视频`
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
              {{ isStopping ? '等待当前视频完成…' : '处理完当前视频后停止' }}
            </Button>
          </div>
        </div>
        <p class="mt-[9px] text-[11px] text-muted-foreground leading-[18px]">
          <InfoIcon
            class="mr-1 inline size-4"
            aria-hidden="true"
          />
          导入与下载期间请保持此页打开。已加入的结果与导入进度会保留，重新打开后可手动继续。
        </p>
        <p
          v-if="settings.isPaused"
          class="mt-[9px] text-[12px] text-primary"
          role="status"
        >
          队列已暂停，新任务将等待恢复。
        </p>
        <p
          v-if="notice"
          class="mt-[12px] text-[12px] text-primary leading-[20px]"
          role="status"
        >
          {{ notice }}
        </p>
      </template>
    </template>
  </section>
</template>
