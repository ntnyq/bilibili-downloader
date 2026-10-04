<script setup lang="ts">
import { cn } from '~/lib/utils'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

defineSlots<{ default: () => VNode[] }>()
</script>

<template>
  <p
    :class="cn('text-muted-foreground text-sm', props.class)"
    data-slot="card-description"
  >
    <slot />
  </p>
</template>
