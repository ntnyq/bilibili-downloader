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
import { QUALITY_LABELS } from '~/utils/downloads/quality'
import type { QualityPreference } from '~/types/download'

defineProps<{ disabled?: boolean; variant?: 'select' | 'cards' }>()
const quality = defineModel<QualityPreference>({ required: true })
const options: QualityPreference[] = ['best', '1080', '720', '480']
const QUALITY_DESCRIPTIONS: Record<QualityPreference, string> = {
  best: '优先最佳体验',
  '1080': '清晰与大小兼顾',
  '720': '节省存储空间',
  '480': '更小的文件',
}
</script>

<template>
  <RadioGroupRoot
    v-model="quality"
    v-if="variant === 'cards'"
    :disabled
    aria-label="画质偏好"
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
        value === 'best' ? '最高可用' : `${value}P`
      }}</span>
      <span class="mt-1 block text-[11px] text-muted-foreground">{{
        QUALITY_DESCRIPTIONS[value]
      }}</span>
    </RadioGroupItem>
  </RadioGroupRoot>
  <div
    v-else
    class="mt-[14px] flex items-center justify-between gap-[12px] text-[12px]"
  >
    <Label
      as="span"
      class="shrink-0 text-muted-foreground"
      >画质偏好</Label
    >
    <Select
      v-model="quality"
      :disabled
      ><SelectTrigger
        aria-label="画质偏好"
        class="w-[190px] max-w-full"
        ><SelectValue /></SelectTrigger
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
