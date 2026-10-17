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
    :class="cn('flex flex-col gap-2 text-center sm:text-left', props.class)"
    data-slot="alert-dialog-header"
  >
    <slot />
  </div>
</template>
