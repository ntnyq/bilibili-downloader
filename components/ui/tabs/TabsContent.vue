<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { TabsContent } from 'reka-ui'
import { cn } from '~/lib/utils'
import type { TabsContentProps } from 'reka-ui'
import type { HTMLAttributes, VNode } from 'vue'

const props = defineProps<
  TabsContentProps & { class?: HTMLAttributes['class'] }
>()

defineSlots<{ default: () => VNode[] }>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <TabsContent
    :class="cn('flex-1 outline-none', props.class)"
    data-slot="tabs-content"
    v-bind="delegatedProps"
  >
    <slot />
  </TabsContent>
</template>
