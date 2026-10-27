<script setup lang="ts">
import { SelectRoot, useForwardPropsEmits } from 'reka-ui'
import type { SelectRootEmits, SelectRootProps } from 'reka-ui'

const props = defineProps<SelectRootProps>()
const emit = defineEmits<SelectRootEmits>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<template>
  <SelectRoot
    v-slot="slotProps"
    v-bind="forwarded"
    data-slot="select"
  >
    <slot v-bind="slotProps" />
  </SelectRoot>
</template>
