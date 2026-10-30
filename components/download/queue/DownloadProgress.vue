<script lang="ts" setup>
import { CircleCheckIcon } from '@lucide/vue'
import { formatBytes } from '~/utils/downloads/format'
import { getJobStatusLabel, STATUS_LABELS } from '~/utils/downloads/labels'
import { canPauseJob } from '~/utils/downloads/queue/control'
import { isJobActive } from '~/utils/downloads/queue/jobs'
import { i18n } from '~/utils/i18n'
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
        {{ getJobStatusLabel(job) || STATUS_LABELS[job.status] }}
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
          >{{ i18n.t('downloadProgress.pause') }}</Button
        >
        <Button
          @click="emit('resume', job.id)"
          v-else-if="job.status === 'paused'"
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-primary"
          type="button"
          >{{ i18n.t('downloadProgress.resume') }}</Button
        >
        <Button
          @click="emit('cancel', job.id)"
          v-if="isActive"
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-primary"
          type="button"
          >{{ i18n.t('downloadProgress.cancel') }}</Button
        >
        <Button
          @click="emit('retry', job.id)"
          v-else-if="canRetry"
          variant="ghost"
          size="sm"
          class="text-muted-foreground hover:text-primary"
          type="button"
          >{{ i18n.t('downloadProgress.retry') }}</Button
        >
      </div>
    </div>
    <Progress
      v-if="isActive && job.status !== 'queued'"
      :model-value="job.progress"
      :aria-label="i18n.t('downloadProgress.downloadProgressEstimated')"
      class="mt-3 h-1"
    />
    <p
      v-if="job.status === 'downloading' || job.status === 'paused'"
      class="mt-1.5 text-muted-foreground"
    >
      {{
        i18n.t('downloadProgress.downloaded', [formatBytes(job.receivedBytes)])
      }}<span v-if="job.totalBytes">{{
        i18n.t('downloadProgress.approximately', [formatBytes(job.totalBytes)])
      }}</span>
    </p>
    <p
      v-if="job.status === 'paused'"
      class="mt-1.5 text-muted-foreground"
    >
      {{
        ['video', 'audio'].includes(job.kind)
          ? i18n.t(
              'downloadProgress.transferStoppedAndCacheRetainedResumingWillValidate',
            )
          : i18n.t('downloadProgress.pausedResumingWillFetchThisAssetAgain')
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
