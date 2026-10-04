<script lang="ts" setup>
import { ChevronDown } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { SelectIcon, SelectTrigger, useForwardProps } from 'reka-ui'
import { cn } from '~/lib/utils'
import type { SelectTriggerProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<
  SelectTriggerProps & { class?: HTMLAttributes['class'] }
>()

defineSlots<{
  default: () => VNode[]
}>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectTrigger
    v-bind="forwardedProps"
    :class="
      cn(
        'flex h-9 min-w-0 w-full gap-2 items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate text-start',
        props.class,
      )
    "
    data-slot="select-trigger"
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="w-4 h-4 opacity-50 shrink-0" />
    </SelectIcon>
  </SelectTrigger>
</template>
