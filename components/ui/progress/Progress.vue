<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { ProgressIndicator, ProgressRoot } from 'reka-ui'
import type { ProgressRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = withDefaults(
  defineProps<ProgressRootProps & { class?: HTMLAttributes['class'] }>(),
  {
    modelValue: 0,
  },
)

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ProgressRoot
    v-bind="delegatedProps"
    :class="
      cn(
        'bg-primary/20 relative h-2 w-full overflow-hidden rounded-full',
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
      class="bg-primary h-full flex-1 transition-all motion-reduce:transition-none"
      data-slot="progress-indicator"
    />
  </ProgressRoot>
</template>
