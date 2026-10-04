<script setup lang="ts">
import { CollapsibleContent } from 'reka-ui'
import type { CollapsibleContentProps } from 'reka-ui'
import type { VNode } from 'vue'

const props = defineProps<CollapsibleContentProps>()

defineSlots<{ default: () => VNode[] }>()
</script>

<template>
  <CollapsibleContent
    data-slot="collapsible-content"
    v-bind="props"
  >
    <slot />
  </CollapsibleContent>
</template>
