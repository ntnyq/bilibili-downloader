<script setup lang="ts">
import { cn } from 'cn'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    :class="cn('flex flex-col gap-2 p-2', props.class)"
    data-sidebar="footer"
    data-slot="sidebar-footer"
  >
    <slot />
  </div>
</template>
