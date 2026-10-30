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
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { DOWNLOAD_KIND_LABELS } from '~/utils/downloads/labels'
import { isJobActive } from '~/utils/downloads/queue/jobs'
import { i18n } from '~/utils/i18n'

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
    return i18n.t('downloadQueue.noMatchingTasks')
  }
  return filter.value === 'all'
    ? i18n.t('downloadQueue.saveTheVideosYouLove')
    : i18n.t('downloadQueue.noTasksYet')
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
    label: i18n.t('downloadQueue.allTasks'),
    count: jobs.value.length,
  },
  {
    id: 'active' as const,
    label: i18n.t('downloadQueue.pending'),
    count: activeJobs.value.length,
  },
  {
    id: 'paused' as const,
    label: i18n.t('downloadQueue.paused'),
    count: pausedJobs.value.length,
  },
  {
    id: 'completed' as const,
    label: i18n.t('downloadQueue.completed'),
    count: completedJobs.value.length,
  },
  {
    id: 'failed' as const,
    label: i18n.t('batchPreview.failed'),
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
    queueError.value = getErrorMessage(error_)
  }
}
</script>

<template>
  <section
    :aria-label="i18n.t('downloadQueue.downloadTasks')"
    class="rounded-xl border bg-background px-4 pb-2 sm:px-5"
  >
    <Tabs v-model="filter">
      <TabsList
        :aria-label="i18n.t('downloadQueue.filterDownloadTasks')"
        class="h-auto w-full justify-start gap-4 overflow-x-auto rounded-none border-b bg-transparent p-0"
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
              :aria-label="i18n.t('downloadQueue.searchDownloadTasks')"
              :placeholder="i18n.t('downloadQueue.searchTitleBvIdOrPart')"
              type="search"
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
            {{
              settings.isPaused
                ? i18n.t('downloadQueue.resumeQueue')
                : i18n.t('downloadQueue.pauseQueue')
            }}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child
              ><Button
                :aria-label="i18n.t('downloadQueue.moreQueueActions')"
                variant="outline"
                size="icon"
                ><EllipsisIcon class="size-4" /></Button
            ></DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              class="w-52"
            >
              <DropdownMenuLabel>{{
                i18n.t('downloadQueue.filteredRecords', visibleJobs.length)
              }}</DropdownMenuLabel>
              <DropdownMenuItem
                @select="downloadHistory(visibleJobs, 'json')"
                :disabled="isExporting || !visibleJobs.length"
                >{{ i18n.t('downloadLibrary.exportJson') }}</DropdownMenuItem
              >
              <DropdownMenuItem
                @select="downloadHistory(visibleJobs, 'csv')"
                :disabled="isExporting || !visibleJobs.length"
                >{{ i18n.t('downloadLibrary.exportCsv') }}</DropdownMenuItem
              >
              <DropdownMenuSeparator />
              <DropdownMenuItem
                @select="retryFailed"
                :disabled="!failedJobs.length"
                >{{ i18n.t('downloadQueue.retryAllFailed') }}</DropdownMenuItem
              >
              <DropdownMenuItem
                @select="cancel()"
                :disabled="!activeJobs.length"
                >{{ i18n.t('downloadQueue.cancelAll') }}</DropdownMenuItem
              >
              <DropdownMenuItem
                @select="clear"
                :disabled="jobs.length <= activeJobs.length"
                >{{
                  i18n.t('downloadQueue.clearQueueRecords')
                }}</DropdownMenuItem
              >
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p
          v-if="settings.isPaused"
          class="mb-4 rounded-[10px] bg-accent px-3.5 py-3 text-[13px] text-primary"
          role="status"
        >
          {{
            i18n.t('downloadQueue.queuePausedTheCurrentTaskWillFinishOthers')
          }}
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
                ? i18n.t('downloadQueue.tryAnotherTitleBvIdOrPart')
                : i18n.t('downloadQueue.clickDownloadVideoOnABilibiliVideoPage')
            }}
          </p>
          <a
            href="https://www.bilibili.com"
            target="_blank"
            rel="noreferrer"
            class="mt-6 bili-primary-button inline-flex"
            >{{ i18n.t('downloadQueue.exploreBilibili') }}</a
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
