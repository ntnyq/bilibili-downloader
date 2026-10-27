<script setup lang="ts">
import { DropdownMenuRoot, useForwardPropsEmits } from 'reka-ui'
import type { DropdownMenuRootEmits, DropdownMenuRootProps } from 'reka-ui'

const props = defineProps<DropdownMenuRootProps>()
const emit = defineEmits<DropdownMenuRootEmits>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<template>
  <DropdownMenuRoot
    v-slot="slotProps"
    v-bind="forwarded"
    data-slot="dropdown-menu"
  >
    <slot v-bind="slotProps" />
  </DropdownMenuRoot>
</template>
