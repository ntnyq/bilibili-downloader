<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip'
import SidebarMenuButtonChild from './SidebarMenuButtonChild.vue'
import { useSidebar } from './utils'
import type { Component } from 'vue'
import type { SidebarMenuButtonProps } from './SidebarMenuButtonChild.vue'

const props = withDefaults(
  defineProps<
    SidebarMenuButtonProps & {
      tooltip?: string | Component
    }
  >(),
  {
    as: 'button',
    variant: 'default',
    size: 'default',
  },
)

defineOptions({
  inheritAttrs: false,
})

const { isMobile, state } = useSidebar()

const delegatedProps = reactiveOmit(props, 'tooltip')
</script>

<template>
  <Tooltip v-if="tooltip">
    <TooltipTrigger as-child>
      <SidebarMenuButtonChild v-bind="{ ...delegatedProps, ...$attrs }">
        <slot />
      </SidebarMenuButtonChild>
    </TooltipTrigger>
    <TooltipContent
      :hidden="state !== 'collapsed' || isMobile"
      side="right"
      align="center"
    >
      <template v-if="typeof tooltip === 'string'">
        {{ tooltip }}
      </template>
      <component
        v-else
        :is="tooltip"
      />
    </TooltipContent>
  </Tooltip>

  <SidebarMenuButtonChild
    v-else
    v-bind="{ ...delegatedProps, ...$attrs }"
  >
    <slot />
  </SidebarMenuButtonChild>
</template>
