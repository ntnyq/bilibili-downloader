<script lang="ts" setup>
import { browser } from '#imports'
import { i18n } from '~/utils/i18n'

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
    pageError.value = i18n.t('app.cannotReadTheCurrentTabRefreshThePage')
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
