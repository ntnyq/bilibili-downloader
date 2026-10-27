<script setup lang="ts">
import { cn } from 'cn'
import { alertVariants } from '.'
import type { HTMLAttributes } from 'vue'
import type { AlertVariants } from '.'

const props = defineProps<{
  class?: HTMLAttributes['class']
  variant?: AlertVariants['variant']
}>()
</script>

<template>
  <div
    :class="cn(alertVariants({ variant }), props.class)"
    role="alert"
    data-slot="alert"
  >
    <slot />
  </div>
</template>
