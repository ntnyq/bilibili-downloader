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
import { i18n } from '~/utils/i18n'

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
  {
    value: '{title}',
    get label() {
      return i18n.t('downloadFileSettings.title')
    },
  },
  {
    value: '{bvid}',
    get label() {
      return i18n.t('downloadFileSettings.bvId')
    },
  },
  {
    value: '{page}',
    get label() {
      return i18n.t('downloadFileSettings.partNumber')
    },
  },
  {
    value: '{part}',
    get label() {
      return i18n.t('downloadFileSettings.partTitle')
    },
  },
  {
    value: '{partSuffix}',
    get label() {
      return i18n.t('downloadFileSettings.multiPartSuffix')
    },
  },
  {
    value: '{owner}',
    get label() {
      return i18n.t('downloadQueueItem.uploader')
    },
  },
  {
    value: '{quality}',
    get label() {
      return i18n.t('downloadFileSettings.qualityAssetDescription')
    },
  },
  {
    value: '{type}',
    get label() {
      return i18n.t('downloadFileSettings.type')
    },
  },
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
    insertionError.value = i18n.t(
      'downloadFileSettings.filenameTemplatesAreLimitedTo160CharactersShorten',
    )
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
    :title="i18n.t('downloadFileSettings.fileSaving')"
    :description="
      i18n.t('downloadFileSettings.setFoldersAndFilenamesToFindYourFiles')
    "
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
            >{{ i18n.t('downloadFileSettings.saveFolder') }}</Label
          >
          <Select
            v-model="folderMode"
            :disabled="!isReady || isSaving"
          >
            <SelectTrigger
              :aria-label="i18n.t('downloadFileSettings.saveFolder')"
              class="w-full"
              ><SelectValue>{{
                FOLDER_MODE_LABELS[folderMode]
              }}</SelectValue></SelectTrigger
            >
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
            {{
              i18n.t(
                'downloadFileSettings.insideTheBilibiliFolderInYourBrowserS',
              )
            }}
          </p>
        </div>
        <label
          ref="templateFieldRef"
          class="block"
        >
          <span
            class="mb-2 flex items-center justify-between gap-2 text-xs font-medium"
            >{{ i18n.t('downloadFileSettings.filenameTemplate')
            }}<span class="text-[11px] font-normal text-muted-foreground">{{
              i18n.t('downloadFileSettings.noExtensionNeeded')
            }}</span></span
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
            {{ i18n.t('downloadFileSettings.clickAVariableToInsertIt') }}
          </p>
          <div class="flex flex-wrap gap-1.5">
            <button
              @click="insertVariable(variable.value)"
              v-for="variable in VARIABLES"
              :key="variable.value"
              :aria-label="
                i18n.t('downloadFileSettings.insertVariable', [variable.label])
              "
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
          :aria-label="i18n.t('downloadFileSettings.filenamePreview')"
          class="rounded-lg border border-dashed bg-muted/70 p-3 text-xs"
          aria-live="polite"
        >
          <p class="mb-2 text-[11px] text-muted-foreground">
            {{ i18n.t('downloadFileSettings.savePreview') }}
          </p>
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
            >{{
              isSaving
                ? i18n.t('downloadFileSettings.saving')
                : i18n.t('downloadFileSettings.saveFileSettings')
            }}</Button
          >
          <Button
            @click="resetDefaults"
            variant="ghost"
            size="sm"
            type="button"
            class="text-muted-foreground"
            >{{ i18n.t('downloadFileSettings.restoreDefaultTemplate') }}</Button
          >
        </div>
      </fieldset>
    </form>
    <p class="mt-3 text-[11px] text-muted-foreground leading-5">
      {{
        i18n.t(
          'downloadFileSettings.appliesToNewTasksOnlyDuplicateFilenamesReceive',
        )
      }}
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
