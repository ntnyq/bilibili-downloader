<script setup lang="ts">
import { cn } from 'cn'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    :class="cn('flex items-center px-6 [.border-t]:pt-6', props.class)"
    data-slot="card-footer"
  >
    <slot />
  </div>
</template>
