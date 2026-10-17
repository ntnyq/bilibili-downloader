<script lang="ts" setup>
import { errorMessage } from '~/utils/downloads/model'
import { startDownloadRunner } from '~/utils/downloads/runner'

const runnerError = shallowRef('')

onMounted(() => {
  startDownloadRunner(message => {
    runnerError.value = message
  }).catch(error => {
    runnerError.value = errorMessage(error)
  })
})
</script>

<template>
  <div class="bili-font min-h-screen bg-background">
    <ExtensionHeader />
    <DownloadWorkspace :runner-error />
  </div>
</template>
