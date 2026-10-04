<script lang="ts" setup>
import { useVModel } from '@vueuse/core'
import { cn } from '~/lib/utils'
import type { HTMLAttributes } from 'vue'

interface Props {
  /**
   * Initial value for an uncontrolled input.
   */
  defaultValue?: string | number
  /**
   * Value owned by the parent form.
   */
  modelValue?: string | number
  /**
   * Additional classes applied to the input.
   */
  class?: HTMLAttributes['class']
}
const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [payload: string | number]
}>()

const modelValue = useVModel(props, 'modelValue', emit, {
  passive: true,
  defaultValue: props.defaultValue,
})
</script>

<template>
  <input
    v-model="modelValue"
    :class="
      cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full min-w-0 rounded-md border bg-background px-3 py-1 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        props.class,
      )
    "
    data-slot="input"
  />
</template>
