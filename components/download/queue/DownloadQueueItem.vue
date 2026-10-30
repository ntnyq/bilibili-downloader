<script lang="ts" setup>
import {
  ChevronDownIcon,
  ClockIcon,
  EllipsisIcon,
  FilmIcon,
  FolderIcon,
  InfoIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
} from '@lucide/vue'
import { formatBytes } from '~/utils/downloads/format'
import {
  DOWNLOAD_KIND_LABELS,
  getJobStatusLabel,
  QUALITY_LABELS,
  STATUS_LABELS,
  SUBTITLE_LANGUAGE_LABELS,
} from '~/utils/downloads/labels'
import { canPauseJob } from '~/utils/downloads/queue/control'
import { isJobActive } from '~/utils/downloads/queue/jobs'
import type { DownloadJob } from '~/types/download'

interface Props {
  /**
   * Queue task displayed by this row.
   */
  job: DownloadJob
  /**
   * One-based position among waiting tasks.
   */
  waitingPosition?: number
  /**
   * Total tasks waiting to start.
   */
  waitingCount: number
}
const props = defineProps<Props>()
const emit = defineEmits<{
  cancel: [id: string]
  retry: [id: string]
  pause: [id: string]
  resume: [id: string]
  move: [id: string, direction: 'up' | 'down']
  showFile: [id?: number]
}>()
const detailsId = useId()
const isDetailsOpen = shallowRef(false)
const isNativeOptionsOpen = shallowRef(false)
const isActive = computed(() => isJobActive(props.job))
const canUseNative = computed(
  () =>
    (props.job.kind === 'video' || props.job.kind === 'audio')
    && ['paused', 'failed', 'cancelled', 'completed', 'native'].includes(
      props.job.status,
    ),
)
const canRetry = computed(() =>
  ['failed', 'cancelled'].includes(props.job.status),
)
const hasProgress = computed(
  () => isActive.value && props.job.status !== 'queued',
)
const progress = computed(() =>
  Math.min(100, Math.max(0, Math.round(props.job.progress))),
)
const statusClass = computed(() => {
  if (props.job.status === 'completed') {
    return 'bg-success/10 text-success'
  }
  if (props.job.status === 'failed') {
    return 'bg-destructive/10 text-destructive'
  }
  if (['paused', 'queued', 'cancelled'].includes(props.job.status)) {
    return 'bg-muted text-muted-foreground'
  }
  return 'bg-accent text-primary'
})
</script>

<template>
  <li class="flex items-start gap-3.5 py-5">
    <div
      class="hidden h-14.5 w-22 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent sm:flex"
    >
      <img
        v-if="job.cover"
        :src="job.cover"
        alt=""
        referrerpolicy="no-referrer"
        class="h-full w-full object-cover"
      />
      <FilmIcon
        v-else
        class="size-6 text-primary"
        aria-hidden="true"
      />
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-3">
        <a
          :href="`https://www.bilibili.com/video/${job.bvid}/?p=${job.page}`"
          target="_blank"
          rel="noreferrer"
          class="line-clamp-2 text-sm font-medium hover:text-primary"
          >{{ job.title }}</a
        >
        <span
          :class="statusClass"
          class="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
          >{{ getJobStatusLabel(job) || STATUS_LABELS[job.status] }}</span
        >
      </div>
      <div
        class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground"
      >
        <span class="rounded bg-muted px-1.5 py-0.5">{{
          DOWNLOAD_KIND_LABELS[job.kind]
        }}</span>
        <span
          v-if="job.pageCount > 1 && job.kind !== 'cover'"
          class="min-w-0 wrap-break-word"
          >P{{ job.page }} · {{ job.part }}</span
        >
        <span v-else>{{ job.kind === 'cover' ? '视频封面' : '单视频' }}</span>
        <span v-if="job.kind === 'video'">{{
          job.quality || QUALITY_LABELS[job.qualityPreference]
        }}</span>
        <span v-else-if="job.kind === 'subtitle'">{{
          SUBTITLE_LANGUAGE_LABELS[job.subtitleLanguage]
        }}</span>
      </div>
      <div
        v-if="hasProgress"
        class="mt-3"
      >
        <div
          class="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"
        >
          <span v-if="['downloading', 'paused', 'native'].includes(job.status)"
            >已下载 {{ formatBytes(job.receivedBytes)
            }}<template v-if="job.totalBytes">
              / 约 {{ formatBytes(job.totalBytes) }}</template
            ></span
          >
          <span v-else>{{
            getJobStatusLabel(job) || STATUS_LABELS[job.status]
          }}</span>
          <span
            v-if="job.status !== 'native'"
            class="font-medium text-primary tabular-nums"
            >{{ progress }}%</span
          >
        </div>
        <Progress
          :model-value="job.status === 'native' ? null : progress"
          class="mt-2 h-1.5"
          aria-label="下载进度（估算）"
        />
      </div>
      <p
        v-if="job.status === 'queued'"
        class="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <ClockIcon
          class="size-3.5"
          aria-hidden="true"
        />等待顺序 {{ waitingPosition }} / {{ waitingCount }}
      </p>
      <p
        v-if="job.status === 'paused'"
        class="mt-2 text-[11px] text-muted-foreground"
      >
        {{
          ['video', 'audio'].includes(job.kind)
            ? '已保留缓存，继续时将校验素材并尝试续传。'
            : '继续后将重新读取此素材。'
        }}
      </p>
      <p
        v-if="job.status === 'completed'"
        class="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <FolderIcon
          class="size-3.5"
          aria-hidden="true"
        />{{
          job.downloadId === undefined
            ? '文件已保存，路径见详情'
            : '已保存到 Bilibili 文件夹'
        }}
      </p>
      <div
        v-if="job.error && job.status === 'failed'"
        class="mt-3 flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive"
        role="alert"
      >
        <InfoIcon
          class="mt-0.5 size-3.5 shrink-0"
          aria-hidden="true"
        />
        <p class="min-w-0 wrap-break-word">{{ job.error }}</p>
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          @click="isDetailsOpen = !isDetailsOpen"
          :aria-expanded="isDetailsOpen"
          :aria-controls="detailsId"
          variant="ghost"
          size="sm"
          class="mr-auto text-xs text-muted-foreground sm:mr-0"
          type="button"
          >{{ isDetailsOpen ? '收起详情' : '查看详情'
          }}<ChevronDownIcon
            :class="isDetailsOpen && 'rotate-180'"
            class="size-3"
            aria-hidden="true"
        /></Button>
        <Button
          @click="emit('pause', job.id)"
          v-if="canPauseJob(job)"
          variant="outline"
          size="sm"
          type="button"
          ><PauseIcon
            class="size-3.5"
            aria-hidden="true"
          />暂停</Button
        >
        <Button
          @click="emit('resume', job.id)"
          v-else-if="job.status === 'paused'"
          variant="outline"
          size="sm"
          type="button"
          ><PlayIcon
            class="size-3.5"
            aria-hidden="true"
          />继续</Button
        >
        <Button
          @click="emit('retry', job.id)"
          v-else-if="canRetry"
          variant="outline"
          size="sm"
          type="button"
          class="text-destructive"
          ><RotateCcwIcon
            class="size-3.5"
            aria-hidden="true"
          />重试</Button
        >
        <Button
          @click="emit('showFile', job.downloadId)"
          v-else-if="job.status === 'completed' && job.downloadId !== undefined"
          variant="outline"
          size="sm"
          type="button"
          ><FolderIcon
            class="size-3.5"
            aria-hidden="true"
          />打开文件夹</Button
        >
        <DropdownMenu>
          <DropdownMenuTrigger as-child
            ><Button
              :aria-label="`更多操作：${job.title} P${job.page}`"
              variant="outline"
              size="icon-sm"
              ><EllipsisIcon
                class="size-4"
                aria-hidden="true" /></Button
          ></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem as-child
              ><a
                :href="`https://www.bilibili.com/video/${job.bvid}/?p=${job.page}`"
                target="_blank"
                rel="noreferrer"
                >查看原视频</a
              ></DropdownMenuItem
            >
            <template v-if="job.status === 'queued'">
              <DropdownMenuItem
                @select="emit('move', job.id, 'up')"
                :disabled="waitingPosition === 1"
                >提前下载</DropdownMenuItem
              >
              <DropdownMenuItem
                @select="emit('move', job.id, 'down')"
                :disabled="waitingPosition === waitingCount"
                >推后下载</DropdownMenuItem
              >
            </template>
            <template v-if="isActive"
              ><DropdownMenuSeparator /><DropdownMenuItem
                @select="emit('cancel', job.id)"
                class="text-destructive"
                >取消任务</DropdownMenuItem
              ></template
            >
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        v-show="isDetailsOpen"
        :id="detailsId"
        class="mt-3 rounded-lg bg-muted/70 p-3 text-xs text-muted-foreground"
      >
        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
          <dt>视频编号</dt>
          <dd>{{ job.bvid }}</dd>
          <template v-if="job.owner"
            ><dt>UP 主</dt>
            <dd>{{ job.owner }}</dd></template
          >
          <template v-if="job.kind === 'video'"
            ><dt>提交偏好</dt>
            <dd>{{ QUALITY_LABELS[job.qualityPreference] }}</dd></template
          >
          <template v-if="job.filename"
            ><dt>保存路径</dt>
            <dd class="break-all">{{ job.filename }}</dd></template
          >
        </dl>
        <Collapsible
          v-model:open="isNativeOptionsOpen"
          v-show="canUseNative"
          class="mt-3 border-t pt-2"
        >
          <CollapsibleTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              class="text-xs text-muted-foreground"
            >
              高级选项：本地助手
              <ChevronDownIcon
                :class="isNativeOptionsOpen && 'rotate-180'"
                class="size-3"
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
          <!-- Collapsing options must not disconnect an active native task. -->
          <CollapsibleContent
            v-show="isNativeOptionsOpen"
            force-mount
          >
            <p class="mt-2 leading-5">
              需要另行安装 Python、FFmpeg
              和可选的通信宿主。安装与使用说明见「下载缓存」中的高级选项。
            </p>
            <DownloadNativeExport :job />
            <DownloadNativeBridge :job />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  </li>
</template>
