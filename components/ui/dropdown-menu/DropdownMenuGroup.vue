<script setup lang="ts">
import { DropdownMenuGroup } from 'reka-ui'
import type { DropdownMenuGroupProps } from 'reka-ui'
import type { VNode } from 'vue'

const props = defineProps<DropdownMenuGroupProps>()

defineSlots<{ default: () => VNode[] }>()
</script>

<template>
  <DropdownMenuGroup
    data-slot="dropdown-menu-group"
    v-bind="props"
  >
    <slot />
  </DropdownMenuGroup>
</template>
