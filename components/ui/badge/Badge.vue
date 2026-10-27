<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { Primitive } from 'reka-ui'
import { badgeVariants } from '.'
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { BadgeVariants } from '.'

const props = defineProps<
  PrimitiveProps & {
    variant?: BadgeVariants['variant']
    class?: HTMLAttributes['class']
  }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <Primitive
    :class="cn(badgeVariants({ variant }), props.class)"
    v-bind="delegatedProps"
    data-slot="badge"
  >
    <slot />
  </Primitive>
</template>
