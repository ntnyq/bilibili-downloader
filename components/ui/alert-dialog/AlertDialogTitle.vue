<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core'
import { cn } from 'cn'
import { AlertDialogTitle } from 'reka-ui'
import type { AlertDialogTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

const props = defineProps<
  AlertDialogTitleProps & { class?: HTMLAttributes['class'] }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <AlertDialogTitle
    v-bind="delegatedProps"
    :class="cn('text-lg font-semibold', props.class)"
    data-slot="alert-dialog-title"
  >
    <slot />
  </AlertDialogTitle>
</template>
