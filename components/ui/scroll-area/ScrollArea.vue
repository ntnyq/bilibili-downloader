<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from 'reka-ui'
import ScrollBar from './ScrollBar.vue'
import type { ScrollAreaRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  ScrollAreaRootProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ScrollAreaRoot
    v-bind="delegatedProps"
    :class="cn('relative', props.class)"
    data-slot="scroll-area"
  >
    <ScrollAreaViewport
      class="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-3 focus-visible:outline-1"
      data-slot="scroll-area-viewport"
    >
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
