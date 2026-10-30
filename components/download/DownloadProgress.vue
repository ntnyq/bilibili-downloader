<script lang="ts" setup>
import { CircleCheckIcon } from '@lucide/vue'
import { jobStatusLabel } from '~/utils/downloads/assets'
import {
  formatBytes,
  isJobActive,
  STATUS_LABELS,
} from '~/utils/downloads/model'
import { canPauseJob } from '~/utils/downloads/taskControl'
import type { DownloadJob } from '~/types/download'

const props = defineProps<{
  job: DownloadJob
}>()
const emit = defineEmits<{
  cancel: [id: string]
  retry: [id: string]
  pause: [id: string]
  resume: [id: string]
}>()
const isActive = computed(() => isJobActive(props.job))
const canRetry = computed(() =>
  ['failed', 'cancelled'].includes(props.job.status),
)
</script>

<template>
  <div class="min-w-0 text-[12px]">
    <div class="flex items-center justify-between gap-3">
      <span
        :class="
          job.status === 'failed' ? 'text-destructive' : 'text-foreground'
        "
        class="flex items-center gap-1.5 font-medium"
      >
        <CircleCheckIcon
          v-if="job.status === 'completed'"
          class="size-4 shrink-0 text-success"
          aria-hidden="true"
        />
        {{ jobStatusLabel(job) || STATUS_LABELS[job.status] }}
        <span
          v-if="job.quality"
          class="text-muted-foreground font-normal"
          >{{ job.quality }}</span
        >
      </span>
      <div class="flex shrink-0 items-center gap-3">
        <Button
          @click="emit('pause', job.id)"
          v-if="canPauseJob(job)"
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-primary"
          type="button"
        >
          暂停
        </Button>
        <Button
          @click="emit('resume', job.id)"
          v-else-if="job.status === 'paused'"
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-primary"
          type="button"
        >
          继续
        </Button>
        <Button
          @click="emit('cancel', job.id)"
          v-if="isActive"
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-primary"
          type="button"
        >
          取消
        </Button>
        <Button
          @click="emit('retry', job.id)"
          v-else-if="canRetry"
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-primary"
          type="button"
        >
          重试
        </Button>
      </div>
    </div>
    <Progress
      v-if="isActive && job.status !== 'queued'"
      :model-value="job.progress"
      class="mt-3 h-1"
      aria-label="下载进度（估算）"
    />
    <p
      v-if="job.status === 'downloading' || job.status === 'paused'"
      class="mt-1.5 text-muted-foreground"
    >
      已下载 {{ formatBytes(job.receivedBytes)
      }}<span v-if="job.totalBytes">
        / 约 {{ formatBytes(job.totalBytes) }}</span
      >
    </p>
    <p
      v-if="job.status === 'paused'"
      class="mt-1.5 text-muted-foreground"
    >
      {{
        ['video', 'audio'].includes(job.kind)
          ? '已停止传输并保留缓存，继续时将校验素材并尝试续传。'
          : '已暂停，继续后将重新读取此素材。'
      }}
    </p>
    <Alert
      v-if="job.error && job.status === 'failed'"
      class="mt-2 wrap-break-word text-destructive leading-relaxed"
      variant="destructive"
      ><AlertDescription>
        {{ job.error }}
      </AlertDescription></Alert
    >
  </div>
</template>
