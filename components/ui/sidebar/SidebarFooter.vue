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
  <div
    :class="cn('flex flex-col gap-2 p-2', props.class)"
    data-slot="sidebar-footer"
    data-sidebar="footer"
  >
    <slot />
  </div>
</template>
