<script lang="ts" setup>
import { FileTextIcon, FolderIcon } from '@lucide/vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { useDownloadFileSettings } from '~/composables/useDownloadFileSettings'
import { FOLDER_MODE_LABELS } from '~/utils/downloads/labels'

const {
  isReady,
  isSaving,
  error: settingsError,
  filenameTemplate,
  folderMode,
  preview,
  validation,
  notice,
  formError,
  save,
  resetDefaults,
} = useDownloadFileSettings()
const templateFieldRef = useTemplateRef<HTMLLabelElement>('templateFieldRef')
const hasTemplateFocus = shallowRef(false)
const insertionError = shallowRef('')
const previewDirectory = computed(() =>
  preview.value.slice(0, preview.value.lastIndexOf('/') + 1),
)
const previewFilename = computed(() =>
  preview.value.slice(preview.value.lastIndexOf('/') + 1),
)
const VARIABLES = [
  { value: '{title}', label: '标题' },
  { value: '{bvid}', label: 'BV 号' },
  { value: '{page}', label: '页码' },
  { value: '{part}', label: '分 P 标题' },
  { value: '{partSuffix}', label: '多 P 后缀' },
  { value: '{owner}', label: 'UP 主' },
  { value: '{quality}', label: '画质 / 素材说明' },
  { value: '{type}', label: '类型' },
] as const

async function insertVariable(token: string) {
  const input = templateFieldRef.value?.querySelector('input')
  if (!input || !isReady.value || isSaving.value) {
    return
  }
  const start = hasTemplateFocus.value
    ? (input.selectionStart ?? filenameTemplate.value.length)
    : filenameTemplate.value.length
  const end = hasTemplateFocus.value ? (input.selectionEnd ?? start) : start
  const next =
    filenameTemplate.value.slice(0, start)
    + token
    + filenameTemplate.value.slice(end)
  if (next.length > 160) {
    insertionError.value = '命名模板最多 160 个字符，请缩短后再插入变量。'
    return
  }
  insertionError.value = ''
  filenameTemplate.value = next
  await nextTick()
  input.focus()
  input.setSelectionRange(start + token.length, start + token.length)
}
watch(filenameTemplate, () => {
  insertionError.value = ''
})
</script>

<template>
  <DownloadSettingsSection
    title="文件保存"
    description="设置目录和文件名，方便以后查找。"
  >
    <template #icon><FileTextIcon class="size-4.5" /></template>
    <form @submit.prevent="save">
      <fieldset
        :disabled="!isReady || isSaving"
        class="min-w-0 space-y-4"
      >
        <div>
          <Label
            as="span"
            class="mb-2 block text-xs"
            >保存目录</Label
          >
          <Select
            v-model="folderMode"
            :disabled="!isReady || isSaving"
          >
            <SelectTrigger
              aria-label="保存目录"
              class="w-full"
              ><SelectValue
            /></SelectTrigger>
            <SelectContent
              ><SelectItem
                v-for="(label, value) in FOLDER_MODE_LABELS"
                :key="value"
                :value
                >{{ label }}</SelectItem
              ></SelectContent
            >
          </Select>
          <p class="mt-1.5 text-xs text-muted-foreground">
            位于浏览器默认下载目录下的 Bilibili 文件夹。
          </p>
        </div>
        <label
          ref="templateFieldRef"
          class="block"
        >
          <span
            class="mb-2 flex items-center justify-between gap-2 text-xs font-medium"
            >命名模板<span class="text-[11px] font-normal text-muted-foreground"
              >无需扩展名</span
            ></span
          >
          <Input
            @focus="hasTemplateFocus = true"
            v-model="filenameTemplate"
            :aria-invalid="!validation.success"
            maxlength="160"
            class="h-10 text-sm"
          />
        </label>
        <div>
          <p class="mb-2 text-[11px] text-muted-foreground">
            点击变量插入到模板
          </p>
          <div class="flex flex-wrap gap-1.5">
            <button
              @click="insertVariable(variable.value)"
              v-for="variable in VARIABLES"
              :key="variable.value"
              :aria-label="`插入${variable.label}变量`"
              type="button"
              class="rounded-md border bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/50 hover:bg-accent disabled:opacity-50"
            >
              {{ variable.label }}
              <span class="text-primary">{{ variable.value }}</span>
            </button>
          </div>
          <p
            v-if="insertionError"
            class="mt-2 text-xs text-destructive"
            role="alert"
          >
            {{ insertionError }}
          </p>
        </div>
        <div
          v-if="preview"
          class="rounded-lg border border-dashed bg-muted/70 p-3 text-xs"
          aria-label="文件名预览"
          aria-live="polite"
        >
          <p class="mb-2 text-[11px] text-muted-foreground">保存效果预览</p>
          <p class="flex items-start gap-1.5 text-muted-foreground">
            <FolderIcon
              class="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            /><span class="break-all">{{ previewDirectory }}</span>
          </p>
          <p class="mt-1.5 flex items-start gap-1.5">
            <FileTextIcon
              class="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            /><span class="break-all">{{ previewFilename }}</span>
          </p>
        </div>
        <Alert
          v-else
          variant="destructive"
          ><AlertDescription>{{
            validation.error?.issues[0]?.message
          }}</AlertDescription></Alert
        >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Button
            :disabled="!validation.success"
            type="submit"
            >{{ isSaving ? '正在保存…' : '保存文件设置' }}</Button
          >
          <Button
            @click="resetDefaults"
            variant="ghost"
            size="sm"
            type="button"
            class="text-muted-foreground"
            >恢复默认模板</Button
          >
        </div>
      </fieldset>
    </form>
    <p class="mt-3 text-[11px] text-muted-foreground leading-5">
      仅影响新任务；重名文件会自动增加后缀。
    </p>
    <Alert
      v-if="formError || settingsError"
      class="mt-3"
      variant="destructive"
      ><AlertDescription>{{
        formError || settingsError
      }}</AlertDescription></Alert
    >
    <p
      v-if="notice"
      class="mt-3 text-xs text-primary"
      role="status"
    >
      {{ notice }}
    </p>
  </DownloadSettingsSection>
</template>
