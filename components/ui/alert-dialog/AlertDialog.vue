<script setup lang="ts">
import { AlertDialogRoot, useForwardPropsEmits } from 'reka-ui'
import type { AlertDialogEmits, AlertDialogProps } from 'reka-ui'

const props = defineProps<AlertDialogProps>()
const emit = defineEmits<AlertDialogEmits>()

const forwarded = useForwardPropsEmits(props, emit)
</script>

<template>
  <AlertDialogRoot
    v-slot="slotProps"
    v-bind="forwarded"
    data-slot="alert-dialog"
  >
    <slot v-bind="slotProps" />
  </AlertDialogRoot>
</template>
