<script setup lang="ts">
import { cn } from 'cn'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <li
    :class="cn('group/menu-item relative', props.class)"
    data-sidebar="menu-item"
    data-slot="sidebar-menu-item"
  >
    <slot />
  </li>
</template>
