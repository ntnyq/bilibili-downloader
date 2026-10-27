<script setup lang="ts">
import { cn } from 'cn'
import { Primitive } from 'reka-ui'
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  PrimitiveProps & {
    class?: HTMLAttributes['class']
  }
>()
</script>

<template>
  <Primitive
    :as
    :as-child
    :class="
      cn(
        'text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:select-none group-data-[collapsible=icon]:opacity-0',
        props.class,
      )
    "
    data-sidebar="group-label"
    data-slot="sidebar-group-label"
  >
    <slot />
  </Primitive>
</template>
