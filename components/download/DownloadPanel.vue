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
import { DOWNLOAD_KIND_LABELS, QUALITY_LABELS } from '~/utils/downloads/labels'
import { parseSeasonLocation } from '~/utils/downloads/parseVideoLocation'
import { getJobIdentity } from '~/utils/downloads/queue/identity'
import { isJobActive } from '~/utils/downloads/queue/jobs'
import { i18n } from '~/utils/i18n'
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
  episode,
  unavailableReason,
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

const isSeasonOpen = shallowRef(false)

const seasonLocation = computed(() => parseSeasonLocation(props.url))
const epId = computed(() =>
  location.value && 'epId' in location.value ? location.value.epId : undefined,
)
const seasonTarget = computed(
  () =>
    seasonLocation.value
    ?? (isSeasonOpen.value && epId.value ? { epId: epId.value } : undefined),
)
const activeEpisodeIds = computed(
  () =>
    new Set(
      jobs.value.flatMap(job =>
        job.epId !== undefined && job.kind === 'video' && isJobActive(job)
          ? [job.epId]
          : [],
      ),
    ),
)

const latestBundle = computed(() =>
  bundles.value.find(bundle => bundle.bvid === video.value?.bvid),
)
const isMultipart = computed(() => (video.value?.pages.length || 0) > 1)
const isSplitLayout = computed(
  () => props.embedded && isMultipart.value && hasPageAssets.value,
)
const relatedJobs = computed(() =>
  jobs.value.filter(
    job =>
      !!video.value
      && job.epId === video.value.epId
      && (job.epId !== undefined || job.bvid === video.value.bvid)
      && job.kind === kind.value
      && (kind.value !== 'subtitle'
        || job.subtitleLanguage === subtitleLanguage.value),
  ),
)
const latestJob = computed(() => {
  const relevant = relatedJobs.value.filter(
    job =>
      episode.value || targetPages.value.some(page => page.cid === job.cid),
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

    const active = new Set(jobs.value.filter(isJobActive).map(getJobIdentity))

    return bundleKinds.value.every(asset =>
      (asset === 'cover' ? info.pages.slice(0, 1) : pages).every(page =>
        active.has(
          getJobIdentity({
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
      relatedJobs.value.some(
        job => (episode.value || job.cid === page.cid) && isJobActive(job),
      ),
    )
  )
})
const downloadLabel = computed(() => {
  if (isAdding.value) {
    return i18n.t('downloadPanel.addingToQueue')
  }

  if (isAlreadyQueued.value) {
    return i18n.t('downloadPanel.addedToDownloadQueue')
  }

  if (episode.value) {
    return i18n.t('episode.downloadCurrentEpisode')
  }

  if (isBundleEnabled.value) {
    return i18n.t('downloadPanel.downloadBundleAssets', bundleTaskCount.value)
  }

  if (kind.value === 'cover') {
    return i18n.t('downloadPanel.downloadVideoCover')
  }

  if (kind.value !== 'video') {
    return isMultipart.value
      ? i18n.t('downloadPanel.downloadAssetParts', targetPages.value.length, [
          DOWNLOAD_KIND_LABELS[kind.value],
          targetPages.value.length,
        ])
      : i18n.t('labels.downloading', [DOWNLOAD_KIND_LABELS[kind.value]])
  }

  if (mode.value === 'selected') {
    return i18n.t(
      'downloadPanel.downloadSelectedParts',
      targetPages.value.length,
    )
  }

  if (mode.value === 'all' && isMultipart.value) {
    return i18n.t(
      'downloadPanel.downloadAllParts',
      video.value?.pages.length ?? 0,
    )
  }

  return isMultipart.value
    ? i18n.t('downloadPanel.downloadCurrentPart', [
        currentPage.value?.page ?? 1,
      ])
    : i18n.t('downloadPanel.downloadVideo')
})
const isDownloadDisabled = computed(
  () =>
    isAdding.value
    || isAlreadyQueued.value
    || !!unavailableReason.value
    || (isBundleEnabled.value && !bundleKinds.value.length)
    || !targetPages.value.length
    || !preferences.isReady.value
    || preferences.isSaving.value,
)
const subtitlePart = computed(() =>
  !isBundleEnabled.value
  && kind.value === 'subtitle'
  && targetPages.value.length === 1
    ? targetPages.value[0]
    : undefined,
)
const canEstimateSize = computed(
  () =>
    !isBundleEnabled.value
    && kind.value === 'video'
    && mode.value === 'current'
    && !unavailableReason.value
    && preferences.isReady.value
    && !preferences.isSaving.value,
)

const isQualityDisabled = computed(
  () =>
    !preferences.isReady.value
    || preferences.isSaving.value
    || isAdding.value
    || !!unavailableReason.value,
)
const panelError = computed(
  () =>
    unavailableReason.value
    || downloadError.value
    || queueError.value
    || preferences.error.value,
)

const optionsUrl = browser.runtime.getURL('/options.html')
const { settings, updateSettings } = preferences

watch(epId, () => {
  isSeasonOpen.value = false
})
</script>

<template>
  <section
    :class="embedded ? '@container' : 'max-h-150'"
    :aria-label="i18n.t('extensionName')"
    class="bili-font flex flex-col overflow-hidden rounded-lg border border-border bg-white text-foreground"
  >
    <header
      class="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3.5"
    >
      <div class="flex items-center gap-3 text-[15px] font-semibold">
        <ExtensionLogo class="size-8" />
        {{ i18n.t('extensionName') }}
      </div>
      <div class="flex items-center gap-1">
        <Button
          :href="optionsUrl"
          :aria-label="i18n.t('downloadPanel.settingsAndHelp')"
          as="a"
          target="_blank"
          variant="ghost"
          size="icon-sm"
        >
          <Settings2Icon class="size-4" />
        </Button>
        <slot name="header-actions" />
      </div>
    </header>
    <div
      v-if="epId"
      class="flex shrink-0 justify-end border-b px-4 py-1"
    >
      <Button
        @click="isSeasonOpen = !isSeasonOpen"
        :aria-expanded="isSeasonOpen"
        size="sm"
        variant="ghost"
        type="button"
        class="text-primary"
      >
        {{
          i18n.t(
            isSeasonOpen ? 'season.backToEpisode' : 'season.selectEpisodes',
          )
        }}
      </Button>
    </div>
    <div
      v-if="seasonTarget"
      class="min-h-0 flex-1 overflow-y-auto px-4 py-2.5"
    >
      <DownloadSeason
        :key="
          'seasonId' in seasonTarget
            ? `ss${seasonTarget.seasonId}`
            : `ep${seasonTarget.epId}`
        "
        :target="seasonTarget"
        :active-episode-ids
      />
    </div>
    <div
      v-else
      class="min-h-0 flex-1 overflow-y-auto px-4 py-2.5"
    >
      <div
        v-if="isLoading"
        class="py-4.5 text-[13px] text-muted-foreground"
        role="status"
      >
        {{ i18n.t('downloadPanel.loadingVideoInformation') }}
      </div>
      <div
        v-else-if="!location"
        class="py-4 text-center"
      >
        <TvMinimalIcon
          class="shrink-0 mx-auto mb-3 block size-8 text-primary"
          aria-hidden="true"
        />
        <p class="text-[15px] font-medium">
          {{ i18n.t('downloadPanel.findAVideoYouLove') }}
        </p>
        <p class="mt-1.5 text-[12px] text-muted-foreground">
          {{ i18n.t('downloadPanel.openABilibiliVideoToDownloadVideosAudio') }}
        </p>
        <a
          class="mt-4.5 bili-primary-button inline-flex"
          href="https://www.bilibili.com"
          target="_blank"
          rel="noreferrer"
        >
          {{ i18n.t('downloadPanel.openBilibili') }}
        </a>
      </div>
      <div
        v-else-if="video && currentPage"
        :class="
          isSplitLayout
          && '@min-[600px]:grid @min-[600px]:grid-cols-2 @min-[600px]:gap-x-6'
        "
      >
        <div class="flex items-center gap-3">
          <div
            :class="episode ? 'h-18 w-13.5' : 'h-15 w-24'"
            class="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent"
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
              class="size-6 text-primary"
              aria-hidden="true"
            />
          </div>
          <div class="min-w-0">
            <h2
              :title="video.title"
              class="line-clamp-2 text-[14px] font-semibold leading-5.25"
            >
              {{ video.title }}
            </h2>
            <p
              v-if="episode"
              :title="currentPage.part"
              class="mt-1.25 flex items-baseline gap-1.5 text-[12px] text-muted-foreground"
            >
              <span class="max-w-full truncate font-semibold text-foreground">
                {{ episode.episodeLabel }}
              </span>
              <span
                v-if="episode.episodeTitle"
                class="truncate"
              >
                {{ episode.episodeTitle }}
              </span>
            </p>
            <p
              v-else
              class="mt-1.25 truncate text-[12px] text-muted-foreground"
            >
              {{
                i18n.t('downloadPanel.parts', video.pages.length, [
                  video.owner,
                  video.pages.length,
                ])
              }}
            </p>
          </div>
        </div>
        <div>
          <DownloadBundlePicker
            v-model:enabled="isBundleEnabled"
            v-model:kinds="bundleKinds"
            v-model:subtitle-language="subtitleLanguage"
            v-if="!episode"
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
              episode
              || (isBundleEnabled
                ? bundleKinds.includes('video')
                : kind === 'video')
            "
            :model-value="settings.quality"
            :disabled="isQualityDisabled"
          />
        </div>
        <div
          :class="
            isSplitLayout
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
            class="mt-2.5 text-[12px] text-primary"
            role="status"
          >
            {{ i18n.t('downloadPanel.theQueueIsPausedNewTasksWillWait') }}
          </p>
        </div>
      </div>
      <div
        v-if="panelError"
        class="mt-3 rounded-lg bg-accent p-3 text-[12px] text-destructive leading-5"
        role="alert"
      >
        {{ panelError }}
        <Button
          @click="load"
          v-if="!video || unavailableReason"
          variant="ghost"
          size="sm"
          type="button"
          class="ml-2 text-muted-foreground hover:text-primary underline"
        >
          {{ i18n.t('downloadPanel.reload') }}
        </Button>
      </div>
      <p
        v-if="notice"
        class="mt-3 text-[12px] text-primary leading-5"
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
        class="mt-4"
      />
      <div
        v-if="!isBundleEnabled && latestJob"
        class="mt-4 border-t border-border pt-3.5"
      >
        <p
          v-if="mode !== 'current' && latestJob.kind !== 'cover'"
          class="mb-2.5 truncate text-[12px] text-muted-foreground"
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
      <template v-if="!seasonTarget && video && currentPage">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span
            v-if="episode"
            class="font-semibold"
          >
            MP4
          </span>
          <span v-else>
            {{
              hasPageAssets
                ? i18n.t('downloadPanel.partsSelected', targetPages.length)
                : i18n.t('downloadPanel.oneCoverPerVideo')
            }}
          </span>
          <DownloadSizeEstimate
            v-if="canEstimateSize"
            :key="`${episode?.epId ?? video.bvid}:${currentPage.cid}:${settings.quality}`"
            :bvid="video.bvid"
            :ep-id="episode?.epId"
            :part="currentPage"
            :quality="settings.quality"
          />
          <span
            v-if="!episode"
            class="ms-auto text-foreground"
          >
            {{
              isBundleEnabled
                ? i18n.t('downloadPanel.bundleAssets', bundleTaskCount)
                : DOWNLOAD_KIND_LABELS[kind]
            }}
            <template v-if="!isBundleEnabled && kind === 'video'">
              · {{ QUALITY_LABELS[settings.quality] }}
            </template>
          </span>
        </div>
        <div class="my-2 flex flex-wrap gap-2">
          <Button
            @click="download"
            :disabled="isDownloadDisabled"
            type="button"
            class="h-10 grow"
          >
            <DownloadIcon
              class="shrink-0 size-4"
              aria-hidden="true"
            />
            {{ downloadLabel }}
          </Button>
          <DownloadSubtitleCopy
            v-if="subtitlePart"
            :key="`${video.bvid}:${subtitlePart.cid}:${subtitleLanguage}`"
            :bvid="video.bvid"
            :cid="subtitlePart.cid"
            :subtitle-language
          />
        </div>
      </template>
      <div class="flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-1.5">
          <FolderIcon
            class="size-4"
            aria-hidden="true"
          />
          {{ i18n.t('downloadPanel.bilibiliFolder') }}
        </span>
        <Button
          @click="openManager"
          variant="ghost"
          size="sm"
          class="h-7 text-primary"
        >
          {{ i18n.t('downloadPanel.downloadCenter') }}
          <ArrowUpRightIcon
            class="size-4"
            aria-hidden="true"
          />
        </Button>
      </div>
    </footer>
  </section>
</template>
