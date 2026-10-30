<script lang="ts" setup>
import {
  EllipsisIcon,
  FolderDownIcon,
  PauseIcon,
  PlayIcon,
  SearchIcon,
} from '@lucide/vue'
import { browser } from '#imports'
import { useDownloadHistory } from '~/composables/useDownloadHistory'
import { useDownloadQueue } from '~/composables/useDownloadQueue'
import { useDownloadSettings } from '~/composables/useDownloadSettings'
import { DOWNLOAD_KIND_LABELS } from '~/utils/downloads/assets'
import { errorMessage, isJobActive } from '~/utils/downloads/model'

const {
  jobs,
  error: queueError,
  activeJobs,
  completedJobs,
  cancel,
  pause,
  resume,
  move,
  retry,
  retryFailed,
  clear,
} = useDownloadQueue()
const {
  settings,
  isReady,
  isSaving,
  error: settingsError,
  updateSettings,
} = useDownloadSettings()
const {
  isExporting,
  error: exportError,
  notice: exportNotice,
  downloadHistory,
} = useDownloadHistory()

const filter = shallowRef<'all' | 'active' | 'paused' | 'completed' | 'failed'>(
  'all',
)
const search = shallowRef('')
const failedJobs = computed(() =>
  jobs.value.filter(job => job.status === 'failed'),
)
const pausedJobs = computed(() =>
  jobs.value.filter(job => job.status === 'paused'),
)
const waitingJobs = computed(() =>
  jobs.value.filter(job => job.status === 'queued'),
)
const waitingPositions = computed(
  () => new Map(waitingJobs.value.map((job, index) => [job.id, index + 1])),
)
const orderedJobs = computed(() => [
  ...jobs.value.filter(isJobActive),
  ...jobs.value.filter(job => !isJobActive(job)).toReversed(),
])
const query = computed(() => search.value.trim().toLocaleLowerCase())
const emptyTitle = computed(() => {
  if (query.value) {
    return '没有匹配的任务'
  }
  return filter.value === 'all' ? '喜欢的视频，慢慢收藏' : '这里还没有任务'
})
const visibleJobs = computed(() =>
  orderedJobs.value
    .filter(
      job =>
        filter.value === 'all'
        || (filter.value === 'active'
          ? isJobActive(job)
          : job.status === filter.value),
    )
    .filter(
      job =>
        !query.value
        || `${job.title} ${job.bvid} P${job.page} ${job.part} ${DOWNLOAD_KIND_LABELS[job.kind]}`
          .toLocaleLowerCase()
          .includes(query.value),
    ),
)
const filters = computed(() => [
  {
    id: 'all' as const,
    label: '全部任务',
    count: jobs.value.length,
  },
  {
    id: 'active' as const,
    label: '待处理',
    count: activeJobs.value.length,
  },
  {
    id: 'paused' as const,
    label: '已暂停',
    count: pausedJobs.value.length,
  },
  {
    id: 'completed' as const,
    label: '已完成',
    count: completedJobs.value.length,
  },
  {
    id: 'failed' as const,
    label: '失败',
    count: failedJobs.value.length,
  },
])

async function showFile(id?: number) {
  if (id === undefined) {
    return
  }
  try {
    await browser.downloads.show(id)
  } catch (error_) {
    queueError.value = errorMessage(error_)
  }
}
</script>

<template>
  <section
    class="rounded-xl border bg-background px-4 pb-2 sm:px-5"
    aria-label="下载任务"
  >
    <Tabs v-model="filter">
      <TabsList
        class="h-auto w-full justify-start gap-4 overflow-x-auto rounded-none border-b bg-transparent p-0"
        aria-label="筛选下载任务"
      >
        <TabsTrigger
          v-for="item in filters"
          :key="item.id"
          :value="item.id"
          class="h-12 flex-none rounded-none border-0 border-b-2 border-transparent px-0 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
          >{{ item.label }}
          <span
            class="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums"
            >{{ item.count }}</span
          ></TabsTrigger
        >
      </TabsList>
      <TabsContent
        :value="filter"
        class="mt-0"
      >
        <div class="my-4 flex flex-wrap items-center justify-between gap-3">
          <Label
            class="min-w-40 flex flex-1 basis-full items-center gap-2 border border-border rounded-lg bg-muted/60 px-3 py-2.5 focus-within:border-primary sm:basis-auto"
          >
            <SearchIcon
              class="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              v-model="search"
              type="search"
              aria-label="搜索下载任务"
              placeholder="搜索标题、BV 号或分 P"
              class="h-auto min-w-0 w-full border-0 bg-transparent p-0 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </Label>
          <Button
            @click="updateSettings({ isPaused: !settings.isPaused })"
            :disabled="!isReady || isSaving"
            variant="outline"
            type="button"
            class="ml-auto"
          >
            <component
              :is="settings.isPaused ? PlayIcon : PauseIcon"
              aria-hidden="true"
              class="size-4 shrink-0"
            />
            {{ settings.isPaused ? '恢复队列' : '暂停队列' }}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child
              ><Button
                variant="outline"
                size="icon"
                aria-label="更多队列操作"
                ><EllipsisIcon class="size-4" /></Button
            ></DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              class="w-52"
            >
              <DropdownMenuLabel
                >当前筛选 {{ visibleJobs.length }} 条记录</DropdownMenuLabel
              >
              <DropdownMenuItem
                @select="downloadHistory(visibleJobs, 'json')"
                :disabled="isExporting || !visibleJobs.length"
                >导出 JSON</DropdownMenuItem
              >
              <DropdownMenuItem
                @select="downloadHistory(visibleJobs, 'csv')"
                :disabled="isExporting || !visibleJobs.length"
                >导出 CSV</DropdownMenuItem
              >
              <DropdownMenuSeparator />
              <DropdownMenuItem
                @select="retryFailed"
                :disabled="!failedJobs.length"
                >重试全部失败</DropdownMenuItem
              >
              <DropdownMenuItem
                @select="cancel()"
                :disabled="!activeJobs.length"
                >取消全部</DropdownMenuItem
              >
              <DropdownMenuItem
                @select="clear"
                :disabled="jobs.length <= activeJobs.length"
                >清除队列记录</DropdownMenuItem
              >
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p
          v-if="settings.isPaused"
          class="mb-4 rounded-[10px] bg-accent px-3.5 py-3 text-[13px] text-primary"
          role="status"
        >
          队列已暂停：当前任务会继续完成，其余任务等待恢复。请保持下载中心打开。
        </p>
        <Alert
          v-if="queueError || settingsError || exportError"
          class="mt-4 text-[13px] text-destructive"
          variant="destructive"
          ><AlertDescription>
            {{ queueError || settingsError || exportError }}
          </AlertDescription></Alert
        >
        <ul
          v-if="visibleJobs.length"
          class="divide-y divide-border"
        >
          <DownloadQueueItem
            @cancel="cancel"
            @pause="pause"
            @resume="resume"
            @retry="retry"
            @move="move"
            @show-file="showFile"
            v-for="job in visibleJobs"
            :key="job.id"
            :job
            :waiting-position="waitingPositions.get(job.id)"
            :waiting-count="waitingJobs.length"
          />
        </ul>
        <div
          v-else
          class="py-17.5 text-center"
        >
          <FolderDownIcon
            class="shrink-0 mx-auto mb-4.5 block size-10 text-primary"
            aria-hidden="true"
          />
          <h2 class="text-[18px] font-semibold">
            {{ emptyTitle }}
          </h2>
          <p class="mt-2.25 text-[13px] text-muted-foreground">
            {{
              query
                ? '试试其他标题、BV 号或分 P。'
                : '在 B 站视频页点击「下载视频」，任务就会出现在这里。'
            }}
          </p>
          <a
            href="https://www.bilibili.com"
            target="_blank"
            rel="noreferrer"
            class="mt-6 bili-primary-button inline-flex"
            >去 B 站看看</a
          >
        </div>
        <p
          v-if="exportNotice"
          role="status"
          class="mt-3 text-xs text-primary"
        >
          {{ exportNotice }}
        </p>
      </TabsContent>
    </Tabs>
  </section>
</template>
