<script setup lang="ts">
import { cn } from 'cn'
import { Separator } from '~/components/ui/separator'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Separator
    :class="cn('bg-sidebar-border mx-2 w-auto', props.class)"
    data-sidebar="separator"
    data-slot="sidebar-separator"
  >
    <slot />
  </Separator>
</template>
