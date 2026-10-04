<script setup lang="ts">
import { AlertDialogRoot, useForwardPropsEmits } from 'reka-ui'
import type { AlertDialogEmits, AlertDialogProps } from 'reka-ui'
import type { VNode } from 'vue'

const props = defineProps<AlertDialogProps>()

const emit = defineEmits<AlertDialogEmits>()

defineSlots<{ default: () => VNode[] }>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<template>
  <AlertDialogRoot
    v-slot="slotProps"
    data-slot="alert-dialog"
    v-bind="forwarded"
  >
    <slot v-bind="slotProps" />
  </AlertDialogRoot>
</template>
