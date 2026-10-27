<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { TabsContent } from 'reka-ui'
import type { TabsContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  TabsContentProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <TabsContent
    :class="cn('flex-1 outline-none', props.class)"
    v-bind="delegatedProps"
    data-slot="tabs-content"
  >
    <slot />
  </TabsContent>
</template>
