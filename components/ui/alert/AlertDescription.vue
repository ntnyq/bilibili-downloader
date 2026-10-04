<script setup lang="ts">
import { cn } from '~/lib/utils'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

defineSlots<{ default: () => VNode[] }>()
</script>

<template>
  <div
    :class="
      cn(
        'text-muted-foreground col-start-2 text-sm [&_p]:leading-relaxed',
        props.class,
      )
    "
    data-slot="alert-description"
  >
    <slot />
  </div>
</template>
