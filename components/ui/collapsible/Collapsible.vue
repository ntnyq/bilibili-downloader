<script setup lang="ts">
import { CollapsibleRoot, useForwardPropsEmits } from 'reka-ui'
import type { CollapsibleRootEmits, CollapsibleRootProps } from 'reka-ui'
import type { VNode } from 'vue'

const props = defineProps<CollapsibleRootProps>()

const emit = defineEmits<CollapsibleRootEmits>()

defineSlots<{ default: () => VNode[] }>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<template>
  <CollapsibleRoot
    v-slot="slotProps"
    data-slot="collapsible"
    v-bind="forwarded"
  >
    <slot v-bind="slotProps" />
  </CollapsibleRoot>
</template>
