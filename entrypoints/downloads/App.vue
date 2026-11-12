<script lang="ts" setup>
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { startDownloadRunner } from '~/utils/downloads/queue/runner'

const runnerError = shallowRef('')
const controller = new AbortController()

onScopeDispose(() => {
  controller.abort()
})

onMounted(() => {
  startDownloadRunner(message => {
    runnerError.value = message
  }, controller.signal).catch(error => {
    if (!controller.signal.aborted) {
      runnerError.value = getErrorMessage(error)
    }
  })
})
</script>

<template>
  <div class="bili-font min-h-screen bg-background">
    <ExtensionHeader />
    <DownloadWorkspace :runner-error />
  </div>
</template>
