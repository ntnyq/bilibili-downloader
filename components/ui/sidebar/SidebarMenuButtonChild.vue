<script setup lang="ts">
import { cn } from 'cn'
import { Primitive } from 'reka-ui'
import { sidebarMenuButtonVariants } from '.'
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { SidebarMenuButtonVariants } from '.'

export interface SidebarMenuButtonProps extends PrimitiveProps {
  variant?: SidebarMenuButtonVariants['variant']
  size?: SidebarMenuButtonVariants['size']
  isActive?: boolean
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<SidebarMenuButtonProps>(), {
  as: 'button',
  variant: 'default',
  size: 'default',
})
</script>

<template>
  <Primitive
    :data-size="size"
    :data-active="isActive"
    :class="cn(sidebarMenuButtonVariants({ variant, size }), props.class)"
    :as
    :as-child
    data-sidebar="menu-button"
    v-bind="$attrs"
    data-slot="sidebar-menu-button"
  >
    <slot />
  </Primitive>
</template>
