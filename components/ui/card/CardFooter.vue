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
    :class="cn('flex items-center px-6 [.border-t]:pt-6', props.class)"
    data-slot="card-footer"
  >
    <slot />
  </div>
</template>
