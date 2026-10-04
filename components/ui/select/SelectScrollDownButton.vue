<script lang="ts" setup>
import { ChevronDown } from '@lucide/vue'
import { reactiveOmit } from '@vueuse/core'
import { SelectScrollDownButton, useForwardProps } from 'reka-ui'
import { cn } from '~/lib/utils'
import type { SelectScrollDownButtonProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<
  SelectScrollDownButtonProps & { class?: HTMLAttributes['class'] }
>()

defineSlots<{
  default?: () => VNode[]
}>()

const delegatedProps = reactiveOmit(props, 'class')

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectScrollDownButton
    v-bind="forwardedProps"
    :class="
      cn('flex cursor-default items-center justify-center py-1', props.class)
    "
  >
    <slot>
      <ChevronDown class="size-4" />
    </slot>
  </SelectScrollDownButton>
</template>
