<script lang="ts" setup>
import { useNativeDownload } from '~/composables/useNativeDownload'
import type { DownloadJob } from '~/types/download'

const props = defineProps<{ job: DownloadJob }>()
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
    class="mt-[10px] text-[12px]"
  >
    <Button
      @click="downloadNativeTask(job)"
      :disabled="isExporting"
      variant="ghost"
      size="sm"
      type="button"
      class="text-muted-foreground hover:text-primary disabled:opacity-50"
    >
      {{ isExporting ? '正在导出本地任务…' : '导出本地任务' }}
    </Button>
    <Alert
      v-if="exportError"
      class="mt-[7px] text-destructive"
      variant="destructive"
      ><AlertDescription>
        {{ exportError }}
      </AlertDescription></Alert
    >
    <p
      v-if="notice"
      class="mt-[7px] text-primary"
      role="status"
    >
      {{ notice }}
    </p>
  </div>
</template>
