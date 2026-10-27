<script setup lang="ts">
import { cn } from 'cn'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    :class="cn('w-full text-sm', props.class)"
    data-sidebar="group-content"
    data-slot="sidebar-group-content"
  >
    <slot />
  </div>
</template>
