<script lang="ts" setup>
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { startDownloadRunner } from '~/utils/downloads/queue/runner'

const runnerError = shallowRef('')

onMounted(() => {
  startDownloadRunner(message => {
    runnerError.value = message
  }).catch(error => {
    runnerError.value = getErrorMessage(error)
  })
})
</script>

<template>
  <div class="bili-font min-h-screen bg-background">
    <ExtensionHeader />
    <DownloadWorkspace :runner-error />
  </div>
</template>
