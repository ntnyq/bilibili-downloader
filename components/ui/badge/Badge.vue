<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { Primitive } from 'reka-ui'
import { cn } from '~/lib/utils'
import { badgeVariants } from '.'
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'
import type { BadgeVariants } from '.'

const props = defineProps<
  PrimitiveProps & {
    variant?: BadgeVariants['variant']
    class?: HTMLAttributes['class']
  }
>()

defineSlots<{
  default: () => VNode[]
}>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <Primitive
    :class="cn(badgeVariants({ variant }), props.class)"
    data-slot="badge"
    v-bind="delegatedProps"
  >
    <slot />
  </Primitive>
</template>
