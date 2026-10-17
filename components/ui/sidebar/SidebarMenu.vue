<script setup lang="ts">
import { cn } from '~/lib/utils'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

defineSlots<{
  default: () => VNode[]
}>()
</script>

<template>
  <ul
    :class="cn('flex w-full min-w-0 flex-col gap-1', props.class)"
    data-slot="sidebar-menu"
    data-sidebar="menu"
  >
    <slot />
  </ul>
</template>
