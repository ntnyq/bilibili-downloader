<script lang="ts" setup>
import { CircleHelpIcon } from '@lucide/vue'

const isDownloadCenter = window.location.pathname === '/downloads.html'
</script>

<template>
  <header
    class="flex h-15.5 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6"
  >
    <a
      @click="isDownloadCenter && $event.preventDefault()"
      :aria-current="isDownloadCenter ? 'page' : undefined"
      href="/downloads.html"
      class="flex min-w-0 items-center gap-3 rounded-md font-semibold"
    >
      <ExtensionLogo class="size-8" />
      <span class="text-[15px]">B 站下载器</span>
    </a>
    <Badge
      variant="outline"
      class="hidden text-[10px] font-normal text-muted-foreground sm:inline-flex"
      >扩展</Badge
    >
    <Button
      as="a"
      href="/welcome.html"
      target="_blank"
      rel="noreferrer"
      variant="ghost"
      size="sm"
      class="ml-auto"
      ><CircleHelpIcon class="size-4" /><span class="hidden sm:inline"
        >使用说明</span
      ></Button
    >
  </header>
</template>
