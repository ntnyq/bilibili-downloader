<script setup lang="ts">
import { CollapsibleRoot, useForwardPropsEmits } from 'reka-ui'
import type { CollapsibleRootEmits, CollapsibleRootProps } from 'reka-ui'

const props = defineProps<CollapsibleRootProps>()
const emit = defineEmits<CollapsibleRootEmits>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<template>
  <CollapsibleRoot
    v-slot="slotProps"
    v-bind="forwarded"
    data-slot="collapsible"
  >
    <slot v-bind="slotProps" />
  </CollapsibleRoot>
</template>
