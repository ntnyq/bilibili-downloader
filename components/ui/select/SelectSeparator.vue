<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { SelectSeparator } from 'reka-ui'
import type { SelectSeparatorProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  SelectSeparatorProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <SelectSeparator
    v-bind="delegatedProps"
    :class="cn('bg-border pointer-events-none -mx-1 my-1 h-px', props.class)"
    data-slot="select-separator"
  />
</template>
