<script lang="ts" setup>
import { CheckIcon } from '@lucide/vue'
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { QUALITY_LABELS } from '~/utils/downloads/labels'
import { i18n } from '~/utils/i18n'
import type { QualityPreference } from '~/types/download'

defineProps<{
  disabled?: boolean
  variant?: 'select' | 'cards'
}>()
const quality = defineModel<QualityPreference>({ required: true })
const options: QualityPreference[] = ['best', '1080', '720', '480']
const QUALITY_DESCRIPTIONS: Record<QualityPreference, string> = {
  get best() {
    return i18n.t('downloadQuality.bestViewingExperience')
  },
  get '1080'() {
    return i18n.t('downloadQuality.balanceQualityAndSize')
  },
  get '720'() {
    return i18n.t('downloadQuality.saveStorageSpace')
  },
  get '480'() {
    return i18n.t('downloadQuality.smallerFiles')
  },
}
</script>

<template>
  <RadioGroupRoot
    v-model="quality"
    v-if="variant === 'cards'"
    :disabled
    :aria-label="i18n.t('batchImportOptions.qualityPreference')"
    class="grid grid-cols-2 gap-2 sm:grid-cols-4"
  >
    <RadioGroupItem
      v-for="value in options"
      :key="value"
      :value
      :aria-label="QUALITY_LABELS[value]"
      class="relative min-w-0 rounded-lg border p-3 text-left data-[state=checked]:border-primary/60 data-[state=checked]:bg-accent/40 data-[state=checked]:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
    >
      <CheckIcon
        v-if="quality === value"
        class="absolute top-2 right-2 size-3"
        aria-hidden="true"
      />
      <span class="block text-sm font-medium">{{
        value === 'best' ? i18n.t('downloadQuality.bestAvailable') : `${value}P`
      }}</span>
      <span class="mt-1 block text-[11px] text-muted-foreground">{{
        QUALITY_DESCRIPTIONS[value]
      }}</span>
    </RadioGroupItem>
  </RadioGroupRoot>
  <div
    v-else
    class="mt-3.5 flex items-center justify-between gap-3 text-[12px]"
  >
    <Label
      as="span"
      class="shrink-0 text-muted-foreground"
      >{{ i18n.t('batchImportOptions.qualityPreference') }}</Label
    >
    <Select
      v-model="quality"
      :disabled
      ><SelectTrigger
        :aria-label="i18n.t('batchImportOptions.qualityPreference')"
        class="w-47.5 max-w-full"
        ><SelectValue>{{ QUALITY_LABELS[quality] }}</SelectValue></SelectTrigger
      ><SelectContent>
        <SelectItem
          v-for="value in options"
          :key="value"
          :value
        >
          {{ QUALITY_LABELS[value] }}
        </SelectItem>
      </SelectContent></Select
    >
  </div>
</template>
