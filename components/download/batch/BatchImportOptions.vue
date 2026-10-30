<script lang="ts" setup>
import { ChevronDownIcon, Settings2Icon } from '@lucide/vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  DOWNLOAD_KIND_LABELS,
  QUALITY_LABELS,
  SUBTITLE_LANGUAGE_LABELS,
} from '~/utils/downloads/labels'
import { i18n } from '~/utils/i18n'
import type {
  DownloadKind,
  QualityPreference,
  SubtitleLanguage,
} from '~/types/download'

const props = defineProps<{
  disabled: boolean
}>()
const kind = defineModel<DownloadKind>('kind', { required: true })
const subtitleLanguage = defineModel<SubtitleLanguage>('subtitleLanguage', {
  required: true,
})
const quality = defineModel<QualityPreference>('quality', { required: true })
const mode = defineModel<'current' | 'all'>('mode', { required: true })
const skipCompleted = defineModel<boolean>('skipCompleted', { required: true })
const isExpanded = shallowRef(false)
const toggleLabel = computed(() => {
  if (isExpanded.value) {
    return i18n.t('batchImportOptions.hideOptions')
  }
  return props.disabled
    ? i18n.t('batchImportOptions.viewOptions')
    : i18n.t('batchImportOptions.editOptions')
})
const formatLabel = computed(() => {
  if (kind.value === 'video') {
    return i18n.t('batchImportOptions.qualityPreference')
  }
  return kind.value === 'subtitle'
    ? i18n.t('batchImportOptions.subtitleLanguage')
    : i18n.t('batchImportOptions.outputFormat')
})
const formatValue = computed(() => {
  if (kind.value === 'video') {
    return QUALITY_LABELS[quality.value]
  }
  return kind.value === 'subtitle'
    ? SUBTITLE_LANGUAGE_LABELS[subtitleLanguage.value]
    : DOWNLOAD_KIND_LABELS[kind.value]
})
const rangeLabel = computed(() =>
  kind.value === 'cover'
    ? i18n.t('batchImportOptions.oneCoverPerVideo')
    : mode.value === 'all'
      ? i18n.t('batchImportOptions.allPartsOfEachVideo')
      : i18n.t('batchImportOptions.linkedPartFirstPart'),
)
</script>

<template>
  <Collapsible
    v-model:open="isExpanded"
    class="mt-5 rounded-xl border bg-background p-4 sm:p-5"
  >
    <div class="flex items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 text-sm font-medium">
        <Settings2Icon
          class="size-4"
          aria-hidden="true"
        />{{ i18n.t('batchImportOptions.downloadOptions') }}
      </h3>
      <CollapsibleTrigger as-child
        ><Button
          variant="ghost"
          size="xs"
          >{{ toggleLabel
          }}<ChevronDownIcon
            :class="isExpanded && 'rotate-180'"
            class="size-3"
            aria-hidden="true" /></Button
      ></CollapsibleTrigger>
    </div>
    <dl class="my-4 grid gap-3 text-xs sm:grid-cols-3 sm:divide-x">
      <div>
        <dt class="mb-1 text-muted-foreground">
          {{ i18n.t('batchImportOptions.downloadContent') }}
        </dt>
        <dd>{{ DOWNLOAD_KIND_LABELS[kind] }}</dd>
      </div>
      <div class="sm:pl-4">
        <dt class="mb-1 text-muted-foreground">
          {{ formatLabel }}
        </dt>
        <dd>
          {{ formatValue }}
        </dd>
      </div>
      <div class="sm:pl-4">
        <dt class="mb-1 text-muted-foreground">
          {{ i18n.t('batchImportOptions.partRange') }}
        </dt>
        <dd>{{ rangeLabel }}</dd>
      </div>
    </dl>
    <Label class="flex items-center gap-2 text-xs text-muted-foreground"
      ><Checkbox
        v-model="skipCompleted"
        :disabled
      />{{ i18n.t('batchImportOptions.skipPreviouslyCompletedAssets') }}</Label
    >
    <CollapsibleContent class="mt-4 border-t pt-1">
      <div class="grid gap-x-7 sm:grid-cols-2">
        <div>
          <DownloadAssetPicker
            v-model:kind="kind"
            v-model:subtitle-language="subtitleLanguage"
            :disabled
          />
          <DownloadQuality
            v-model="quality"
            v-if="kind === 'video'"
            :disabled
          />
        </div>
        <div class="mt-4.5">
          <div
            v-if="kind !== 'cover'"
            class="flex items-center justify-between gap-3 text-[12px]"
          >
            <Label
              as="span"
              class="shrink-0 text-muted-foreground"
              >{{ i18n.t('batchImportOptions.partRange') }}</Label
            >
            <Select
              v-model="mode"
              :disabled
              ><SelectTrigger
                :aria-label="i18n.t('batchImportOptions.partRange')"
                class="w-47.5 max-w-full"
                ><SelectValue>{{
                  mode === 'all'
                    ? i18n.t('batchImportOptions.allPartsOfEachVideo')
                    : i18n.t('batchImportOptions.linkedPartFirstPart')
                }}</SelectValue></SelectTrigger
              ><SelectContent>
                <SelectItem value="current">{{
                  i18n.t('batchImportOptions.linkedPartFirstPart')
                }}</SelectItem>
                <SelectItem value="all">{{
                  i18n.t('batchImportOptions.allPartsOfEachVideo')
                }}</SelectItem>
              </SelectContent></Select
            >
          </div>
          <p class="mt-2.5 text-[11px] text-muted-foreground leading-4.5">
            {{
              kind === 'cover'
                ? i18n.t('batchImportOptions.saveOneCoverPerVideo')
                : i18n.t(
                    'batchImportOptions.thePParameterSelectsAPartFavoritesCollections',
                  )
            }}
          </p>
          <p class="mt-1.5 text-[11px] text-muted-foreground leading-4.5">
            {{
              i18n.t(
                'batchImportOptions.localHistoryPreventsDuplicateDownloadsOfTheSame',
              )
            }}
          </p>
        </div>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
