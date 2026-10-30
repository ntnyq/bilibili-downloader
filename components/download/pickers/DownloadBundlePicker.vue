<script lang="ts" setup>
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  DOWNLOAD_KIND_HINTS,
  DOWNLOAD_KIND_LABELS,
  SUBTITLE_LANGUAGE_LABELS,
} from '~/utils/downloads/labels'
import { getBundleFolderMode } from '~/utils/downloads/queue/bundles'
import { i18n } from '~/utils/i18n'
import type { VNode } from 'vue'
import type {
  DownloadKind,
  FolderMode,
  SubtitleLanguage,
} from '~/types/download'

const props = defineProps<{
  disabled?: boolean
  folderMode: FolderMode
}>()

defineSlots<{
  single: () => VNode[]
}>()

const enabled = defineModel<boolean>('enabled', { required: true })
const kinds = defineModel<DownloadKind[]>('kinds', { required: true })
const subtitleLanguage = defineModel<SubtitleLanguage>('subtitleLanguage', {
  required: true,
})

const downloadMode = computed({
  get: () => (enabled.value ? 'bundle' : 'single'),
  set(value: string | number) {
    enabled.value = value === 'bundle'
  },
})

const folderHint = computed(() =>
  getBundleFolderMode(props.folderMode) === 'owner-video'
    ? i18n.t('downloadBundlePicker.bilibiliUploaderVideo')
    : i18n.t('downloadBundlePicker.bilibiliVideo'),
)

function toggleKind(kind: DownloadKind, checked: boolean | 'indeterminate') {
  kinds.value =
    checked === true
      ? [...kinds.value.filter(item => item !== kind), kind]
      : kinds.value.filter(item => item !== kind)
}
</script>

<template>
  <div class="mt-3">
    <Tabs
      v-model="downloadMode"
      class="gap-0"
    >
      <TabsList
        :aria-label="i18n.t('downloadBundlePicker.downloadMode')"
        class="grid w-full grid-cols-2"
      >
        <TabsTrigger
          :disabled
          value="single"
          >{{ i18n.t('downloadBundlePicker.singleAsset') }}</TabsTrigger
        >
        <TabsTrigger
          :disabled
          value="bundle"
          >{{ i18n.t('downloadWorkspace.assetBundles') }}</TabsTrigger
        >
      </TabsList>
      <TabsContent value="single"><slot name="single" /></TabsContent>
      <TabsContent
        value="bundle"
        class="mt-3 space-y-2.5"
      >
        <fieldset :disabled>
          <legend class="mb-2 text-[12px] text-muted-foreground">
            {{ i18n.t('downloadBundlePicker.selectAssets') }}
          </legend>
          <div class="grid grid-cols-2 gap-2">
            <Label
              v-for="(label, value) in DOWNLOAD_KIND_LABELS"
              :key="value"
              :title="DOWNLOAD_KIND_HINTS[value]"
              class="flex items-center gap-1.75 rounded-[7px] bg-muted px-2.5 py-2.25 text-[12px]"
            >
              <Checkbox
                @update:model-value="toggleKind(value, $event)"
                :model-value="kinds.includes(value)"
                :disabled
              />
              {{ label }}
            </Label>
          </div>
        </fieldset>
        <div
          v-if="kinds.includes('subtitle')"
          class="flex items-center justify-between gap-3 text-[12px]"
        >
          <Label
            as="span"
            class="shrink-0 text-muted-foreground"
            >{{ i18n.t('batchImportOptions.subtitleLanguage') }}</Label
          >
          <Select
            v-model="subtitleLanguage"
            :disabled
            ><SelectTrigger
              :aria-label="i18n.t('batchImportOptions.subtitleLanguage')"
              class="w-47.5 max-w-full"
              ><SelectValue>{{
                SUBTITLE_LANGUAGE_LABELS[subtitleLanguage]
              }}</SelectValue></SelectTrigger
            ><SelectContent>
              <SelectItem
                v-for="(label, value) in SUBTITLE_LANGUAGE_LABELS"
                :key="value"
                :value
              >
                {{ label }}
              </SelectItem>
            </SelectContent></Select
          >
        </div>
        <p class="text-[11px] text-muted-foreground leading-4.5">
          {{
            i18n.t(
              'downloadBundlePicker.bundleAssetsAreSavedToUsingYourFilename',
              [folderHint],
            )
          }}
        </p>
        <p
          v-if="kinds.includes('subtitle')"
          class="text-[11px] text-muted-foreground leading-4.5"
        >
          {{
            i18n.t(
              'downloadBundlePicker.missingSubtitlesOrSignInRequirementsAreRecorded',
            )
          }}
        </p>
        <p
          v-if="!kinds.length"
          class="text-[12px] text-destructive"
          role="status"
        >
          {{ i18n.t('downloadBundlePicker.selectAtLeastOneAsset') }}
        </p>
      </TabsContent>
    </Tabs>
  </div>
</template>
