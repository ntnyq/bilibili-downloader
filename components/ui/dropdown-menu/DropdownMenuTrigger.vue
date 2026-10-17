<script setup lang="ts">
import { DropdownMenuTrigger, useForwardProps } from 'reka-ui'
import type { DropdownMenuTriggerProps } from 'reka-ui'
import type { VNode } from 'vue'

const props = defineProps<DropdownMenuTriggerProps>()

defineSlots<{
  default: () => VNode[]
}>()

const forwardedProps = useForwardProps(props)
</script>

<template>
  <DropdownMenuTrigger
    data-slot="dropdown-menu-trigger"
    v-bind="forwardedProps"
  >
    <slot />
  </DropdownMenuTrigger>
</template>
