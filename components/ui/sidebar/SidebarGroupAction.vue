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
        'text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'after:absolute after:-inset-2 md:after:hidden',
        'group-data-[collapsible=icon]:hidden',
        props.class,
      )
    "
    data-sidebar="group-action"
    data-slot="sidebar-group-action"
  >
    <slot />
  </Primitive>
</template>
