<script setup lang="ts">
import { DropdownMenuRadioGroup, useForwardPropsEmits } from 'reka-ui'
import type {
  DropdownMenuRadioGroupEmits,
  DropdownMenuRadioGroupProps,
} from 'reka-ui'

const props = defineProps<DropdownMenuRadioGroupProps>()
const emit = defineEmits<DropdownMenuRadioGroupEmits>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<template>
  <DropdownMenuRadioGroup
    v-bind="forwarded"
    data-slot="dropdown-menu-radio-group"
  >
    <slot />
  </DropdownMenuRadioGroup>
</template>
