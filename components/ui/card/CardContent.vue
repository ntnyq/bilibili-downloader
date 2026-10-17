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
    :class="cn('px-6', props.class)"
    data-slot="card-content"
  >
    <slot />
  </div>
</template>
