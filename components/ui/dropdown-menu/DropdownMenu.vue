<script setup lang="ts">
import { DropdownMenuRoot, useForwardPropsEmits } from 'reka-ui'
import type { DropdownMenuRootEmits, DropdownMenuRootProps } from 'reka-ui'
import type { VNode } from 'vue'

const props = defineProps<DropdownMenuRootProps>()

const emit = defineEmits<DropdownMenuRootEmits>()

defineSlots<{
  default: () => VNode[]
}>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<template>
  <DropdownMenuRoot
    v-slot="slotProps"
    data-slot="dropdown-menu"
    v-bind="forwarded"
  >
    <slot v-bind="slotProps" />
  </DropdownMenuRoot>
</template>
