<script setup lang="ts">
import { cn } from 'cn'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    :class="cn('relative flex w-full min-w-0 flex-col p-2', props.class)"
    data-sidebar="group"
    data-slot="sidebar-group"
  >
    <slot />
  </div>
</template>
