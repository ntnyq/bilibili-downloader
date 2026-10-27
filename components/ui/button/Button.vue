<script setup lang="ts">
import { cn } from 'cn'
import { Primitive } from 'reka-ui'
import { useTemplateRef } from 'vue'
import { buttonVariants } from '.'
import type { PrimitiveProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '.'

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
})
const primitiveRef = useTemplateRef('primitiveRef')

defineExpose({
  /**
   * Restores focus to the launcher after its download panel closes.
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
    :class="cn(buttonVariants({ variant, size }), props.class)"
    data-slot="button"
  >
    <slot />
  </Primitive>
</template>
