<script setup lang="ts">
import { DropdownMenuGroup } from 'reka-ui'
import type { DropdownMenuGroupProps } from 'reka-ui'

const props = defineProps<DropdownMenuGroupProps>()
</script>

<template>
  <DropdownMenuGroup
    v-bind="props"
    data-slot="dropdown-menu-group"
  >
    <slot />
  </DropdownMenuGroup>
</template>
