<script lang="ts" setup>
import { DOWNLOAD_KIND_LABELS } from '~/utils/downloads/assets'
import type { DownloadBundleSummary } from '~/types/downloadBundle'

const props = defineProps<{ bundle: DownloadBundleSummary }>()
const emit = defineEmits<{
  retry: [id: string]
  cancel: [id: string]
  pause: [id: string]
  resume: [id: string]
}>()
const statusLabels: Record<DownloadBundleSummary['status'], string> = {
  active: '组合下载中',
  completed: '组合已全部保存',
  failed: '组合有素材失败',
  cancelled: '组合有素材取消',
  incomplete: '组合记录不完整',
}
const unfinished = computed(() =>
  props.bundle.jobs.filter(job => job.status !== 'completed'),
)
const createdAtLabel = computed(() =>
  new Date(props.bundle.createdAt).toLocaleString('zh-CN'),
)
</script>

<template>
  <section
    class="rounded-[10px] bg-muted p-[12px]"
    aria-label="素材组合下载进度"
  >
    <div class="flex items-start justify-between gap-[10px] text-[12px]">
      <div class="min-w-0">
        <p class="font-semibold">{{ statusLabels[bundle.status] }}</p>
        <p
          :title="bundle.title"
          class="mt-[4px] truncate text-muted-foreground"
        >
          {{ bundle.title }}
        </p>
        <p class="mt-[3px] text-[11px] text-muted-foreground">
          创建于 {{ createdAtLabel }}
        </p>
      </div>
      <span class="shrink-0 text-primary">
        已保存 {{ bundle.completed }} / {{ bundle.total }}
      </span>
    </div>
    <Progress
      :model-value="bundle.progress"
      :aria-valuetext="`已保存 ${bundle.completed} / ${bundle.total} 个素材`"
      class="mt-3 h-1"
      aria-label="素材组合完成进度"
    />
    <p
      class="mt-[8px] flex flex-wrap gap-x-[12px] gap-y-[4px] text-[11px] text-muted-foreground"
      role="status"
    >
      <span v-if="bundle.active">未完成 {{ bundle.active }}</span>
      <span
        v-if="bundle.failed"
        class="text-destructive"
        >失败 {{ bundle.failed }}</span
      >
      <span v-if="bundle.cancelled">已取消 {{ bundle.cancelled }}</span>
      <span
        v-if="bundle.missing"
        class="text-destructive"
        >有 {{ bundle.missing }} 个素材的记录已移除，无法确认完整结果。</span
      >
      <span v-if="bundle.status === 'completed'">全部素材已保存到视频目录</span>
    </p>
    <Collapsible
      v-if="unfinished.length"
      class="mt-[8px] text-[11px]"
    >
      <CollapsibleTrigger
        class="cursor-pointer text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        查看未完成素材（{{ unfinished.length }}）
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul class="mt-[8px] max-h-[180px] overflow-y-auto space-y-[8px]">
          <li
            v-for="job in unfinished"
            :key="job.id"
            class="border-t border-border pt-[8px]"
          >
            <p class="mb-[6px] truncate text-muted-foreground">
              {{ DOWNLOAD_KIND_LABELS[job.kind] }}
              <template v-if="job.kind !== 'cover'">
                · P{{ job.page }}</template
              >
            </p>
            <DownloadProgress
              @cancel="emit('cancel', $event)"
              @retry="emit('retry', $event)"
              @pause="emit('pause', $event)"
              @resume="emit('resume', $event)"
              :job
            />
          </li>
        </ul>
      </CollapsibleContent>
    </Collapsible>
  </section>
</template>
