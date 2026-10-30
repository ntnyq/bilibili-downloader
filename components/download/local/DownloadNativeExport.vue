<script lang="ts" setup>
import { useNativeDownload } from '~/composables/useNativeDownload'
import { i18n } from '~/utils/i18n'
import type { DownloadJob } from '~/types/download'

const props = defineProps<{
  job: DownloadJob
}>()
const {
  isExporting,
  error: exportError,
  notice,
  downloadNativeTask,
} = useNativeDownload()
const canExport = computed(
  () =>
    (props.job.kind === 'video' || props.job.kind === 'audio')
    && ['failed', 'cancelled', 'completed'].includes(props.job.status),
)
</script>

<template>
  <div
    v-if="canExport"
    class="mt-2.5 text-[12px]"
  >
    <Button
      @click="downloadNativeTask(job)"
      :disabled="isExporting"
      variant="ghost"
      size="sm"
      type="button"
      class="text-muted-foreground hover:text-primary disabled:opacity-50"
    >
      {{
        isExporting
          ? i18n.t('downloadNativeExport.exportingLocalTask')
          : i18n.t('downloadNativeExport.exportLocalTask')
      }}
    </Button>
    <Alert
      v-if="exportError"
      class="mt-1.75 text-destructive"
      variant="destructive"
      ><AlertDescription>
        {{ exportError }}
      </AlertDescription></Alert
    >
    <p
      v-if="notice"
      class="mt-1.75 text-primary"
      role="status"
    >
      {{ notice }}
    </p>
  </div>
</template>
