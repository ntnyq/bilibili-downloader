<script lang="ts" setup>
import { Primitive } from 'reka-ui'
import { useTemplateRef } from 'vue'
import { cn } from '~/lib/utils'
import { buttonVariants } from '.'
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'
import type { ButtonVariants } from '.'

interface Props extends PrimitiveProps {
  /**
   * Visual role of the action.
   */
  variant?: ButtonVariants['variant']
  /**
   * Dimensions for text or icon actions.
   */
  size?: ButtonVariants['size']
  /**
   * Additional classes applied to the primitive.
   */
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
})
defineSlots<{
  default: () => VNode[]
}>()

const primitiveRef = useTemplateRef('primitiveRef')

defineExpose({
  /**
   * Restores focus to the underlying button after the panel opens.
   */
  focus() {
    primitiveRef.value?.$el?.focus()
  },
})
</script>

<template>
  <Primitive
    ref="primitiveRef"
    :type="as === 'button' ? 'button' : undefined"
    :data-variant="variant"
    :data-size="size"
    :as
    :as-child
    :class="
      cn(
        buttonVariants({
          variant,
          size,
        }),
        props.class,
      )
    "
    data-slot="button"
  >
    <slot />
  </Primitive>
</template>
