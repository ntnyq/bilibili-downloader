<script setup lang="ts">
import { cn } from 'cn'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    :class="cn('px-6', props.class)"
    data-slot="card-content"
  >
    <slot />
  </div>
</template>
