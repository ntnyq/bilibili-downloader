<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { ScrollAreaScrollbar, ScrollAreaThumb } from 'reka-ui'
import type { ScrollAreaScrollbarProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = withDefaults(
  defineProps<ScrollAreaScrollbarProps & { class?: HTMLAttributes['class'] }>(),
  {
    orientation: 'vertical',
  },
)

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ScrollAreaScrollbar
    v-bind="delegatedProps"
    :class="
      cn(
        'flex touch-none p-px transition-colors select-none',
        orientation === 'vertical'
          && 'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal'
          && 'h-2.5 flex-col border-t border-t-transparent',
        props.class,
      )
    "
    data-slot="scroll-area-scrollbar"
  >
    <ScrollAreaThumb
      class="bg-border relative flex-1 rounded-full"
      data-slot="scroll-area-thumb"
    />
  </ScrollAreaScrollbar>
</template>
