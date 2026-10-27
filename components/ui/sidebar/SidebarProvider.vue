<script setup lang="ts">
import { defaultDocument, useEventListener, useMediaQuery } from '@vueuse/core'
import { cn } from 'cn'
import { TooltipProvider } from 'reka-ui'
import { computed, shallowRef } from 'vue'
import {
  provideSidebarContext,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_KEYBOARD_SHORTCUT,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_ICON,
} from './utils'
import type { HTMLAttributes } from 'vue'

interface Props {
  /**
   * Initial expanded state when no controlled open value is provided.
   */
  defaultOpen?: boolean
  /**
   * Additional classes for the sidebar layout wrapper.
   */
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
const open = defineModel<boolean>('open', {
  default(rawProps: Props) {
    return (
      rawProps.defaultOpen
      ?? !defaultDocument?.cookie.includes(`${SIDEBAR_COOKIE_NAME}=false`)
    )
  },
})

const isMobile = useMediaQuery('(max-width: 768px)')

useEventListener('keydown', (event: KeyboardEvent) => {
  if (
    event.key === SIDEBAR_KEYBOARD_SHORTCUT
    && (event.metaKey || event.ctrlKey)
  ) {
    event.preventDefault()
    toggleSidebar()
  }
})

const openMobile = shallowRef(false)

// We add a state so that we can do data-state="expanded" or "collapsed".
// This makes it easier to style the sidebar with Tailwind classes.
const state = computed(() => (open.value ? 'expanded' : 'collapsed'))

function setOpen(value: boolean) {
  open.value = value

  // This sets the cookie to keep the sidebar state.
  document.cookie = `${SIDEBAR_COOKIE_NAME}=${open.value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
}

function setOpenMobile(value: boolean) {
  openMobile.value = value
}

// Helper to toggle the sidebar.
function toggleSidebar() {
  return isMobile.value
    ? setOpenMobile(!openMobile.value)
    : setOpen(!open.value)
}

provideSidebarContext({
  state,
  open,
  setOpen,
  isMobile,
  openMobile,
  setOpenMobile,
  toggleSidebar,
})
</script>

<template>
  <TooltipProvider :delay-duration="0">
    <div
      :style="{
        '--sidebar-width': SIDEBAR_WIDTH,
        '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
      }"
      :class="
        cn(
          'group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full',
          props.class,
        )
      "
      v-bind="$attrs"
      data-slot="sidebar-wrapper"
    >
      <slot />
    </div>
  </TooltipProvider>
</template>
