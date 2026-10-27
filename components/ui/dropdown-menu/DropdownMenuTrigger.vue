<script setup lang="ts">
import { DropdownMenuTrigger, useForwardProps } from 'reka-ui'
import type { DropdownMenuTriggerProps } from 'reka-ui'

const props = defineProps<DropdownMenuTriggerProps>()

const forwardedProps = useForwardProps(props)
</script>

<template>
  <DropdownMenuTrigger
    v-bind="forwardedProps"
    data-slot="dropdown-menu-trigger"
  >
    <slot />
  </DropdownMenuTrigger>
</template>
