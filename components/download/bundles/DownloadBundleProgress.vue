<script lang="ts" setup>
import { DOWNLOAD_KIND_LABELS } from '~/utils/downloads/labels'
import { i18n } from '~/utils/i18n'
import type { DownloadBundleSummary } from '~/types/downloadBundle'

const props = defineProps<{
  bundle: DownloadBundleSummary
}>()
const emit = defineEmits<{
  retry: [id: string]
  cancel: [id: string]
  pause: [id: string]
  resume: [id: string]
}>()

const statusLabels: Record<DownloadBundleSummary['status'], string> = {
  get active() {
    return i18n.t('downloadBundleProgress.downloadingBundle')
  },
  get completed() {
    return i18n.t('downloadBundleProgress.allBundleAssetsSaved')
  },
  get failed() {
    return i18n.t('downloadBundleProgress.someBundleAssetsFailed')
  },
  get cancelled() {
    return i18n.t('downloadBundleProgress.someBundleAssetsCancelled')
  },
  get incomplete() {
    return i18n.t('downloadBundleProgress.bundleRecordsIncomplete')
  },
}

const unfinished = computed(() =>
  props.bundle.jobs.filter(job => job.status !== 'completed'),
)
const createdAtLabel = computed(() =>
  new Date(props.bundle.createdAt).toLocaleString(i18n.t('localeCode')),
)
</script>

<template>
  <section
    :aria-label="i18n.t('downloadBundleProgress.bundleDownloadProgress')"
    class="rounded-[10px] bg-muted p-3"
  >
    <div class="flex items-start justify-between gap-2.5 text-[12px]">
      <div class="min-w-0">
        <p class="font-semibold">{{ statusLabels[bundle.status] }}</p>
        <p
          :title="bundle.title"
          class="mt-1 truncate text-muted-foreground"
        >
          {{ bundle.title }}
        </p>
        <p class="mt-0.75 text-[11px] text-muted-foreground">
          {{ i18n.t('downloadBundleProgress.created', [createdAtLabel]) }}
        </p>
      </div>
      <span class="shrink-0 text-primary"
        >{{
          i18n.t('downloadBundleProgress.saved', [
            bundle.completed,
            bundle.total,
          ])
        }}
      </span>
    </div>
    <Progress
      :model-value="bundle.progress"
      :aria-valuetext="
        i18n.t('downloadBundleProgress.savedAssets', [
          bundle.completed,
          bundle.total,
        ])
      "
      :aria-label="i18n.t('downloadBundleProgress.bundleCompletionProgress')"
      class="mt-3 h-1"
    />
    <p
      class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
      role="status"
    >
      <span v-if="bundle.active">{{
        i18n.t('downloadBundleProgress.unfinished', [bundle.active])
      }}</span>
      <span
        v-if="bundle.failed"
        class="text-destructive"
        >{{ i18n.t('downloadBundleProgress.failed', [bundle.failed]) }}</span
      >
      <span v-if="bundle.cancelled">{{
        i18n.t('downloadBundleProgress.cancelled', [bundle.cancelled])
      }}</span>
      <span
        v-if="bundle.missing"
        class="text-destructive"
        >{{
          i18n.t(
            'downloadBundleProgress.recordsForAssetsWereRemovedTheFullResult',
            bundle.missing,
          )
        }}</span
      >
      <span v-if="bundle.status === 'completed'">{{
        i18n.t('downloadBundleProgress.allAssetsSavedInTheVideoFolder')
      }}</span>
    </p>
    <Collapsible
      v-if="unfinished.length"
      class="mt-2 text-[11px]"
    >
      <CollapsibleTrigger
        class="cursor-pointer text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >{{
          i18n.t(
            'downloadBundleProgress.viewUnfinishedAssets',
            unfinished.length,
          )
        }}</CollapsibleTrigger
      >
      <CollapsibleContent>
        <ul class="mt-2 max-h-45 overflow-y-auto space-y-2">
          <li
            v-for="job in unfinished"
            :key="job.id"
            class="border-t border-border pt-2"
          >
            <p class="mb-1.5 truncate text-muted-foreground">
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
