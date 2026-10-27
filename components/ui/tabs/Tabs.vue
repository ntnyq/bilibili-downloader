<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { TabsRoot, useForwardPropsEmits } from 'reka-ui'
import type { TabsRootEmits, TabsRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<TabsRootProps & { class?: HTMLAttributes['class'] }>()
const emit = defineEmits<TabsRootEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emit)
</script>

<template>
  <TabsRoot
    v-slot="slotProps"
    v-bind="forwarded"
    :class="cn('flex flex-col gap-2', props.class)"
    data-slot="tabs"
  >
    <slot v-bind="slotProps" />
  </TabsRoot>
</template>
