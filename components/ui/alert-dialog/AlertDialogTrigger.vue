<script setup lang="ts">
import { AlertDialogTrigger } from 'reka-ui'
import type { AlertDialogTriggerProps } from 'reka-ui'
import type { VNode } from 'vue'

const props = defineProps<AlertDialogTriggerProps>()

defineSlots<{ default: () => VNode[] }>()
</script>

<template>
  <AlertDialogTrigger
    data-slot="alert-dialog-trigger"
    v-bind="props"
  >
    <slot />
  </AlertDialogTrigger>
</template>
