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
  <h3
    :class="cn('leading-none font-semibold', props.class)"
    data-slot="card-title"
  >
    <slot />
  </h3>
</template>
