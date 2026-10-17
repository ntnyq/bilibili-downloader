<script setup lang="ts">
import { CollapsibleTrigger } from 'reka-ui'
import type { CollapsibleTriggerProps } from 'reka-ui'
import type { VNode } from 'vue'

const props = defineProps<CollapsibleTriggerProps>()

defineSlots<{
  default: () => VNode[]
}>()
</script>

<template>
  <CollapsibleTrigger
    data-slot="collapsible-trigger"
    v-bind="props"
  >
    <slot />
  </CollapsibleTrigger>
</template>
