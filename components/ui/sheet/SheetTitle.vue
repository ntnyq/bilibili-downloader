<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { DialogTitle } from 'reka-ui'
import type { DialogTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  DialogTitleProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <DialogTitle
    :class="cn('text-foreground font-semibold', props.class)"
    v-bind="delegatedProps"
    data-slot="sheet-title"
  >
    <slot />
  </DialogTitle>
</template>
