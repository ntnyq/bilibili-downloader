<script setup lang="ts">
import { DropdownMenuSub, useForwardPropsEmits } from 'reka-ui'
import type { DropdownMenuSubEmits, DropdownMenuSubProps } from 'reka-ui'
import type { VNode } from 'vue'

const props = defineProps<DropdownMenuSubProps>()

const emit = defineEmits<DropdownMenuSubEmits>()

defineSlots<{ default: () => VNode[] }>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<template>
  <DropdownMenuSub
    v-slot="slotProps"
    data-slot="dropdown-menu-sub"
    v-bind="forwarded"
  >
    <slot v-bind="slotProps" />
  </DropdownMenuSub>
</template>
