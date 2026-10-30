<script lang="ts" setup>
import { useNativeBridge } from '~/composables/useNativeBridge'
import { i18n } from '~/utils/i18n'
import type { DownloadJob } from '~/types/download'

const props = defineProps<{
  job: DownloadJob
}>()
const {
  isRunning,
  status,
  error: nativeError,
  outputPath,
  start,
} = useNativeBridge(() => props.job)
const canStart = computed(
  () =>
    (props.job.kind === 'video' || props.job.kind === 'audio')
    && ['paused', 'failed', 'cancelled', 'completed'].includes(
      props.job.status,
    ),
)
const isVisible = computed(
  () => canStart.value || isRunning.value || status.value || nativeError.value,
)
</script>

<template>
  <div
    v-if="isVisible"
    class="mt-2.5 text-[12px]"
  >
    <Button
      @click="start"
      v-if="canStart"
      :disabled="isRunning"
      variant="ghost"
      size="sm"
      type="button"
      class="text-muted-foreground hover:text-primary disabled:opacity-50"
    >
      {{
        isRunning
          ? i18n.t('downloadNativeBridge.localHelperIsProcessing')
          : i18n.t('downloadNativeBridge.sendToLocalHelper')
      }}
    </Button>
    <p
      v-if="isRunning"
      class="mt-1.75 text-muted-foreground"
    >
      {{
        i18n.t(
          'downloadNativeBridge.keepTheDownloadCenterOpenCompletedFilesAre',
        )
      }}
    </p>
    <p
      v-if="status"
      class="mt-1.75 text-primary"
      role="status"
    >
      {{ status }}
    </p>
    <p
      v-if="outputPath"
      class="mt-1.75 break-all text-muted-foreground"
    >
      {{ i18n.t('downloadNativeBridge.saved', [outputPath]) }}
    </p>
    <Alert
      v-if="nativeError"
      class="mt-1.75 text-destructive"
      variant="destructive"
    >
      <AlertDescription>
        {{ nativeError }}
      </AlertDescription>
    </Alert>
  </div>
</template>
