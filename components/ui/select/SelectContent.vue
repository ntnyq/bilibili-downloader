<script lang="ts" setup>
import { isNull } from '@ntnyq/utils'
import { reactiveOmit } from '@vueuse/core'
import {
  injectSelectRootContext,
  SelectContent,
  SelectPortal,
  SelectViewport,
  useForwardPropsEmits,
} from 'reka-ui'
import { useOverlayTarget } from '~/composables/useOverlayTarget'
import { cn } from '~/lib/utils'
import SelectScrollDownButton from './SelectScrollDownButton.vue'
import SelectScrollUpButton from './SelectScrollUpButton.vue'
import type { SelectContentEmits, SelectContentProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'

const props = withDefaults(
  defineProps<SelectContentProps & { class?: HTMLAttributes['class'] }>(),
  {
    position: 'popper',
    sideOffset: 4,
    collisionPadding: 8,
    bodyLock: false,
    disableOutsidePointerEvents: false,
  },
)

const emit = defineEmits<SelectContentEmits>()

defineOptions({
  inheritAttrs: false,
})

defineSlots<{
  default: () => VNode[]
}>()

const overlayTarget = useOverlayTarget()
const select = injectSelectRootContext()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emit)
/**
 * Handles Escape locally because WXT isolates key events inside the shadow root.
 */
function handleEscape(event: KeyboardEvent) {
  emit('escapeKeyDown', event)
  if (!event.defaultPrevented) {
    select.onOpenChange(false)
  }
}
</script>

<template>
  <SelectPortal
    :to="overlayTarget ?? undefined"
    :disabled="isNull(overlayTarget)"
  >
    <SelectContent
      @keydown.esc.stop="handleEscape"
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'pointer-events-auto relative z-50 max-h-[min(24rem,var(--reka-select-content-available-height))] min-w-(--reka-select-trigger-width) max-w-[calc(100vw-1rem)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none',
          props.class,
        )
      "
      data-slot="select-content"
    >
      <SelectScrollUpButton />
      <SelectViewport :class="cn('p-1', position === 'popper' && 'w-full')">
        <slot />
      </SelectViewport>
      <SelectScrollDownButton />
    </SelectContent>
  </SelectPortal>
</template>
