<script lang="ts" setup>
import { ProgressIndicator, ProgressRoot } from 'reka-ui'
import { cn } from '~/lib/utils'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  /**
   * Percentage complete, or null when the total size is unknown.
   */
  modelValue?: number | null
  /**
   * Additional classes for the track.
   */
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <ProgressRoot
    :model-value="modelValue ?? null"
    :max="100"
    :class="
      cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-secondary',
        props.class,
      )
    "
    data-slot="progress"
  >
    <ProgressIndicator
      :class="
        modelValue == null
          ? 'w-1/3 animate-pulse motion-reduce:animate-none'
          : 'w-full'
      "
      :style="
        modelValue == null
          ? undefined
          : { transform: `translateX(-${100 - modelValue}%)` }
      "
      class="h-full rounded-full bg-primary transition-transform motion-reduce:transition-none"
    />
  </ProgressRoot>
</template>
