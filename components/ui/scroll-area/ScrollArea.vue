<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from 'reka-ui'
import { cn } from '~/lib/utils'
import ScrollBar from './ScrollBar.vue'
import type { ScrollAreaRootProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<
  ScrollAreaRootProps & { class?: HTMLAttributes['class'] }
>()

defineSlots<{
  default: () => VNode[]
}>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ScrollAreaRoot
    v-bind="delegatedProps"
    :class="cn('relative', props.class)"
    data-slot="scroll-area"
  >
    <ScrollAreaViewport
      data-slot="scroll-area-viewport"
      class="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-3 focus-visible:outline-1"
    >
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <ScrollAreaCorner />
  </ScrollAreaRoot>
</template>
