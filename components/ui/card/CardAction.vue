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
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        props.class,
      )
    "
    data-slot="card-action"
  >
    <slot />
  </div>
</template>
