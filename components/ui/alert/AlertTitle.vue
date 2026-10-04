<script setup lang="ts">
import { cn } from '~/lib/utils'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

defineSlots<{ default: () => VNode[] }>()
</script>

<template>
  <div
    :class="
      cn(
        'col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight',
        props.class,
      )
    "
    data-slot="alert-title"
  >
    <slot />
  </div>
</template>
