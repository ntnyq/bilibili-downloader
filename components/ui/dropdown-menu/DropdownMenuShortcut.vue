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
  <span
    :class="
      cn('text-muted-foreground ml-auto text-xs tracking-widest', props.class)
    "
    data-slot="dropdown-menu-shortcut"
  >
    <slot />
  </span>
</template>
