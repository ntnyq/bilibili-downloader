<script lang="ts" setup>
import { CheckIcon, MinusIcon } from '@lucide/vue'
import { CheckboxIndicator, CheckboxRoot, useForwardPropsEmits } from 'reka-ui'
import { computed } from 'vue'
import { cn } from '~/lib/utils'
import type { CheckboxRootEmits, CheckboxRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  CheckboxRootProps & { class?: HTMLAttributes['class'] }
>()
const emit = defineEmits<CheckboxRootEmits>()
const forwarded = useForwardPropsEmits(
  computed(() => {
    const { class: _, ...rest } = props
    return rest
  }),
  emit,
)
</script>

<template>
  <CheckboxRoot
    v-bind="forwarded"
    :class="
      cn(
        'peer size-4 shrink-0 rounded border border-input bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        props.class,
      )
    "
    data-slot="checkbox"
  >
    <CheckboxIndicator class="flex items-center justify-center text-current">
      <MinusIcon
        v-if="modelValue === 'indeterminate'"
        class="size-3.5"
      />
      <CheckIcon
        v-else
        class="size-3.5"
      />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
