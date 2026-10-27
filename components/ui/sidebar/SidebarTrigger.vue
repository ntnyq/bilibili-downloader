<script setup lang="ts">
import { PanelLeft } from '@lucide/vue'
import { cn } from 'cn'
import { Button } from '~/components/ui/button'
import { useSidebar } from './utils'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const { toggleSidebar } = useSidebar()
</script>

<template>
  <Button
    @click="toggleSidebar"
    :class="cn('h-7 w-7', props.class)"
    data-sidebar="trigger"
    variant="ghost"
    size="icon"
    data-slot="sidebar-trigger"
  >
    <PanelLeft />
    <span class="sr-only">Toggle Sidebar</span>
  </Button>
</template>
