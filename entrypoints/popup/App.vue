<script lang="ts" setup>
import { browser } from '#imports'

const url = shallowRef('')
const pageError = shallowRef('')

onMounted(async () => {
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    url.value = tab?.url || ''
  } catch {
    pageError.value = '无法读取当前标签页，请刷新页面后重试。'
  }
})
</script>

<template>
  <main class="bili-font w-95 bg-background">
    <DownloadPanel
      :url
      class="rounded-none border-0"
    />
    <p
      v-if="pageError"
      class="px-4 pb-3 text-xs text-destructive"
      role="alert"
    >
      {{ pageError }}
    </p>
  </main>
</template>
