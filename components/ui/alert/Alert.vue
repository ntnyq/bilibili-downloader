<script setup lang="ts">
import { cn } from '~/lib/utils'
import { alertVariants } from '.'
import type { HTMLAttributes, VNode } from 'vue'
import type { AlertVariants } from '.'

const props = defineProps<{
  class?: HTMLAttributes['class']
  variant?: AlertVariants['variant']
}>()

defineSlots<{ default: () => VNode[] }>()
</script>

<template>
  <div
    :class="cn(alertVariants({ variant }), props.class)"
    data-slot="alert"
    role="alert"
  >
    <slot />
  </div>
</template>
