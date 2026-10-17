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
  <li
    :class="cn('group/menu-item relative', props.class)"
    data-slot="sidebar-menu-item"
    data-sidebar="menu-item"
  >
    <slot />
  </li>
</template>
