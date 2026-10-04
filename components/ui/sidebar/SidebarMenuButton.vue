<script setup lang="ts">
import { Primitive } from 'reka-ui'
import { cn } from '~/lib/utils'
import { sidebarMenuButtonVariants } from '.'
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'
import type { SidebarMenuButtonVariants } from '.'

const props = withDefaults(defineProps<SidebarMenuButtonProps>(), {
  as: 'button',
  variant: 'default',
  size: 'default',
})

defineSlots<{ default: () => VNode[] }>()

export interface SidebarMenuButtonProps extends PrimitiveProps {
  variant?: SidebarMenuButtonVariants['variant']
  size?: SidebarMenuButtonVariants['size']
  isActive?: boolean
  class?: HTMLAttributes['class']
}
</script>

<template>
  <Primitive
    :data-size="size"
    :data-active="isActive"
    :class="cn(sidebarMenuButtonVariants({ variant, size }), props.class)"
    :as
    :as-child
    data-slot="sidebar-menu-button"
    data-sidebar="menu-button"
    v-bind="$attrs"
  >
    <slot />
  </Primitive>
</template>
