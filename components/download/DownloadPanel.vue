<script lang="ts" setup>
import {
  ArrowUpRightIcon,
  DownloadIcon,
  FilmIcon,
  FolderIcon,
  Settings2Icon,
  TvMinimalIcon,
} from '@lucide/vue'
import { browser } from '#imports'
import { useDownloadBundle } from '~/composables/useDownloadBundle'
import { useDownloadQueue } from '~/composables/useDownloadQueue'
import { useVideoDownload } from '~/composables/useVideoDownload'
import { DOWNLOAD_KIND_LABELS, jobIdentity } from '~/utils/downloads/assets'
import { isJobActive } from '~/utils/downloads/model'
import { QUALITY_LABELS } from '~/utils/downloads/quality'
import type { VNode } from 'vue'

const props = defineProps<{
  url: string
  embedded?: boolean
}>()
defineSlots<{
  'header-actions'?: () => VNode[]
}>()

const {
  video,
  currentPage,
  location,
  isLoading,
  isAdding,
  mode,
  kind,
  isBundleEnabled,
  bundleKinds,
  bundleTaskCount,
  hasPageAssets,
  subtitleLanguage,
  selectedPages,
  targetPages,
  preferences,
  error: downloadError,
  notice,
  load,
  download,
} = useVideoDownload(() => props.url)
const {
  jobs,
  error: queueError,
  cancel,
  pause,
  resume,
  retry,
  openManager,
} = useDownloadQueue()
const { bundles } = useDownloadBundle(jobs)
const optionsUrl = browser.runtime.getURL('/options.html')
const latestBundle = computed(() =>
  bundles.value.find(bundle => bundle.bvid === video.value?.bvid),
)
const {
  settings,
  isReady,
  isSaving,
  error: settingsError,
  updateSettings,
} = preferences
const isMultipart = computed(() => (video.value?.pages.length || 0) > 1)
const relatedJobs = computed(() =>
  jobs.value.filter(
    job =>
      job.bvid === video.value?.bvid
      && job.kind === kind.value
      && (kind.value !== 'subtitle'
        || job.subtitleLanguage === subtitleLanguage.value),
  ),
)
const latestJob = computed(() => {
  const relevant = relatedJobs.value.filter(job =>
    targetPages.value.some(page => page.cid === job.cid),
  )
  return relevant.find(isJobActive) || relevant.at(-1)
})
const isAlreadyQueued = computed(() => {
  const pages = targetPages.value
  const info = video.value
  if (isBundleEnabled.value) {
    if (!info || !pages.length || !bundleKinds.value.length) {
      return false
    }
    const active = new Set(jobs.value.filter(isJobActive).map(jobIdentity))
    return bundleKinds.value.every(asset =>
      (asset === 'cover' ? info.pages.slice(0, 1) : pages).every(page =>
        active.has(
          jobIdentity({
            bvid: info.bvid,
            cid: page.cid,
            kind: asset,
            subtitleLanguage: subtitleLanguage.value,
          }),
        ),
      ),
    )
  }
  return (
    !!pages?.length
    && pages.every(page =>
      relatedJobs.value.some(job => job.cid === page.cid && isJobActive(job)),
    )
  )
})
const downloadLabel = computed(() => {
  if (isAdding.value) {
    return '正在加入队列…'
  }
  if (isAlreadyQueued.value) {
    return '已加入下载队列'
  }
  if (isBundleEnabled.value) {
    return `下载素材组合 · ${bundleTaskCount.value} 个素材`
  }
  if (kind.value === 'cover') {
    return '下载视频封面'
  }
  if (kind.value !== 'video') {
    return `下载${DOWNLOAD_KIND_LABELS[kind.value]}${isMultipart.value ? ` · ${targetPages.value.length} P` : ''}`
  }
  if (mode.value === 'selected') {
    return `下载所选 ${targetPages.value.length} P`
  }
  if (mode.value === 'all' && isMultipart.value) {
    return `下载全部 ${video.value?.pages.length} P`
  }
  return isMultipart.value ? `下载当前 P${currentPage.value?.page}` : '下载视频'
})
</script>

<template>
  <section
    :class="embedded ? '@container' : 'max-h-[600px]'"
    class="bili-font flex flex-col overflow-hidden rounded-lg border border-border bg-white text-foreground"
    aria-label="B 站下载器"
  >
    <header
      class="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3.5"
    >
      <div class="flex items-center gap-3 text-[15px] font-semibold">
        <ExtensionLogo class="size-8" />
        B 站下载器
      </div>
      <div class="flex items-center gap-1">
        <Button
          :href="optionsUrl"
          as="a"
          target="_blank"
          variant="ghost"
          size="icon-sm"
          aria-label="设置与说明"
          ><Settings2Icon class="size-4"
        /></Button>
        <slot name="header-actions" />
      </div>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-2.5">
      <div
        v-if="isLoading"
        class="py-[18px] text-[13px] text-muted-foreground"
        role="status"
      >
        正在读取视频信息…
      </div>
      <div
        v-else-if="!location"
        class="py-[16px] text-center"
      >
        <TvMinimalIcon
          class="shrink-0 mx-auto mb-[12px] block size-[32px] text-primary"
          aria-hidden="true"
        />
        <p class="text-[15px] font-medium">去看看喜欢的视频</p>
        <p class="mt-[6px] text-[12px] text-muted-foreground">
          打开 B 站视频页面，即可下载视频、音频、封面、字幕和弹幕。
        </p>
        <a
          class="mt-[18px] bili-primary-button inline-flex"
          href="https://www.bilibili.com"
          target="_blank"
          rel="noreferrer"
          >打开哔哩哔哩</a
        >
      </div>
      <div
        v-else-if="video && currentPage"
        :class="
          embedded
          && isMultipart
          && hasPageAssets
          && '@min-[600px]:grid @min-[600px]:grid-cols-2 @min-[600px]:gap-x-6'
        "
      >
        <div class="flex items-center gap-[12px]">
          <div
            class="h-[60px] w-[96px] shrink-0 overflow-hidden rounded-[8px] bg-accent"
          >
            <img
              v-if="video.cover"
              :src="video.cover"
              alt=""
              referrerpolicy="no-referrer"
              class="h-full w-full object-cover"
            />
            <FilmIcon
              v-else
              class="shrink-0 mx-auto mt-[18px] block size-[24px] text-primary"
              aria-hidden="true"
            />
          </div>
          <div class="min-w-0">
            <h2
              :title="video.title"
              class="line-clamp-2 text-[14px] font-semibold leading-[21px]"
            >
              {{ video.title }}
            </h2>
            <p class="mt-[5px] truncate text-[12px] text-muted-foreground">
              {{ video.owner }} · {{ video.pages.length }} 个分 P
            </p>
          </div>
        </div>
        <div>
          <DownloadBundlePicker
            v-model:enabled="isBundleEnabled"
            v-model:kinds="bundleKinds"
            v-model:subtitle-language="subtitleLanguage"
            :folder-mode="settings.folderMode"
            :disabled="isAdding"
          >
            <template #single>
              <DownloadAssetPicker
                v-model:kind="kind"
                v-model:subtitle-language="subtitleLanguage"
                v-if="!isBundleEnabled"
                :disabled="isAdding"
              />
            </template>
          </DownloadBundlePicker>
          <DownloadQuality
            @update:model-value="updateSettings({ quality: $event })"
            v-if="
              isBundleEnabled ? bundleKinds.includes('video') : kind === 'video'
            "
            :model-value="settings.quality"
            :disabled="!isReady || isSaving || isAdding"
          />
        </div>
        <div
          :class="
            embedded
            && isMultipart
            && hasPageAssets
            && '@min-[600px]:col-start-2 @min-[600px]:row-start-1 @min-[600px]:row-span-2'
          "
        >
          <DownloadPartPicker
            v-model:mode="mode"
            v-model:selected-pages="selectedPages"
            v-if="isMultipart && hasPageAssets"
            :pages="video.pages"
            :current-page="currentPage.page"
          />
          <p
            v-if="settings.isPaused"
            class="mt-[10px] text-[12px] text-primary"
            role="status"
          >
            队列已暂停，加入的任务将等待恢复。请前往下载中心恢复队列。
          </p>
        </div>
      </div>
      <div
        v-if="downloadError || queueError || settingsError"
        class="mt-[12px] rounded-[8px] bg-accent p-[12px] text-[12px] text-destructive leading-[20px]"
        role="alert"
      >
        {{ downloadError || queueError || settingsError }}
        <Button
          @click="load"
          v-if="!video"
          variant="ghost"
          size="sm"
          type="button"
          class="ml-[8px] text-muted-foreground hover:text-primary underline"
        >
          重新读取
        </Button>
      </div>
      <p
        v-if="notice"
        class="mt-[12px] text-[12px] text-primary leading-[20px]"
        role="status"
      >
        {{ notice }}
      </p>
      <DownloadBundleProgress
        @cancel="cancel"
        @retry="retry"
        @pause="pause"
        @resume="resume"
        v-if="isBundleEnabled && latestBundle"
        :bundle="latestBundle"
        class="mt-[16px]"
      />
      <div
        v-if="!isBundleEnabled && latestJob"
        class="mt-[16px] border-t border-border pt-[14px]"
      >
        <p
          v-if="mode !== 'current' && latestJob.kind !== 'cover'"
          class="mb-[10px] truncate text-[12px] text-muted-foreground"
        >
          P{{ latestJob.page }} · {{ latestJob.part }}
        </p>
        <DownloadProgress
          @cancel="cancel"
          @retry="retry"
          @pause="pause"
          @resume="resume"
          :job="latestJob"
        />
      </div>
    </div>
    <footer
      class="shrink-0 rounded-b-lg border-t bg-muted/60 px-4 py-2 text-xs text-muted-foreground"
    >
      <template v-if="video && currentPage">
        <div
          class="flex flex-wrap items-center justify-between gap-1 text-[11px]"
        >
          <span>{{
            hasPageAssets
              ? `已选 ${targetPages.length} 个分 P`
              : '每个视频保存一份封面'
          }}</span>
          <span class="text-foreground"
            >{{
              isBundleEnabled
                ? `素材组合 · ${bundleTaskCount} 个素材`
                : DOWNLOAD_KIND_LABELS[kind]
            }}<template v-if="!isBundleEnabled && kind === 'video'">
              · {{ QUALITY_LABELS[settings.quality] }}</template
            ></span
          >
        </div>
        <Button
          @click="download"
          :disabled="
            isAdding
            || isAlreadyQueued
            || (isBundleEnabled && !bundleKinds.length)
            || !targetPages.length
            || !isReady
            || isSaving
          "
          type="button"
          class="my-2 h-10 w-full"
        >
          <DownloadIcon
            class="shrink-0 size-[16px]"
            aria-hidden="true"
          />{{ downloadLabel }}
        </Button>
      </template>
      <div class="flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-1.5"
          ><FolderIcon
            class="size-4"
            aria-hidden="true"
          />Bilibili 文件夹</span
        >
        <Button
          @click="openManager"
          variant="ghost"
          size="sm"
          class="h-7 text-primary"
          >下载中心
          <ArrowUpRightIcon
            class="size-4"
            aria-hidden="true"
        /></Button>
      </div>
    </footer>
  </section>
</template>
