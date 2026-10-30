<script lang="ts" setup>
import {
  CaptionsIcon,
  ChevronDownIcon,
  EllipsisIcon,
  ImageIcon,
  MessageSquareIcon,
  Music2Icon,
  VideoIcon,
} from '@lucide/vue'
import {
  DOWNLOAD_KIND_LABELS,
  QUALITY_LABELS,
  SUBTITLE_LANGUAGE_LABELS,
} from '~/utils/downloads/labels'
import { i18n } from '~/utils/i18n'
import type { DownloadHistoryRecord } from '~/types/downloadHistory'

const props = defineProps<{
  record: DownloadHistoryRecord
  isBusy: boolean
}>()
const emit = defineEmits<{
  requeue: [identity: string]
  remove: [identity: string]
}>()
const isExpanded = shallowRef(false)
const icons = {
  video: VideoIcon,
  audio: Music2Icon,
  cover: ImageIcon,
  subtitle: CaptionsIcon,
  danmaku: MessageSquareIcon,
}
const date = computed(
  () => new Date(props.record.completedAt ?? props.record.createdAt),
)
const time = computed(() =>
  date.value.toLocaleTimeString(i18n.t('localeCode'), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }),
)
</script>

<template>
  <li>
    <Collapsible v-model:open="isExpanded">
      <div class="flex items-start gap-3 p-4 sm:items-center sm:gap-4 sm:p-5">
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"
        >
          <component
            :is="icons[record.kind]"
            class="size-5"
            aria-hidden="true"
          />
        </div>
        <div class="min-w-0 flex-1">
          <a
            :href="`https://www.bilibili.com/video/${record.bvid}/?p=${record.page}`"
            target="_blank"
            rel="noreferrer"
            class="line-clamp-2 rounded-sm text-sm font-medium hover:text-primary"
            >{{ record.title }}</a
          >
          <div
            class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
          >
            <Badge
              variant="secondary"
              class="text-[11px] font-normal"
              >{{ DOWNLOAD_KIND_LABELS[record.kind] }}</Badge
            >
            <span class="max-w-40 truncate">{{
              record.owner || i18n.t('downloadLibraryItem.unknownUploader')
            }}</span>
            <span v-if="record.pageCount > 1 && record.kind !== 'cover'"
              >P{{ record.page }}</span
            >
            <span v-if="record.quality">{{ record.quality }}</span>
          </div>
          <Button
            @click="emit('requeue', record.identity)"
            :disabled="isBusy"
            variant="ghost"
            size="xs"
            type="button"
            class="mt-2 text-muted-foreground sm:hidden"
            >{{ i18n.t('downloadLibraryItem.downloadAgain') }}</Button
          >
        </div>
        <div class="flex shrink-0 flex-col items-end gap-2">
          <time
            :datetime="date.toISOString()"
            :title="`${record.completedAt === undefined ? i18n.t('downloadLibraryItem.created') : i18n.t('downloadLibraryItem.completed')} ${date.toLocaleString(i18n.t('localeCode'))}`"
            class="text-[11px] text-muted-foreground tabular-nums"
            >{{
              record.completedAt === undefined
                ? i18n.t('downloadLibraryItem.legacyRecord')
                : time
            }}</time
          >
          <Button
            @click="emit('requeue', record.identity)"
            :disabled="isBusy"
            variant="ghost"
            size="sm"
            type="button"
            class="hidden text-xs text-muted-foreground sm:inline-flex"
            >{{ i18n.t('downloadLibraryItem.downloadAgain') }}</Button
          >
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child
            ><Button
              :aria-label="
                i18n.t('downloadLibraryItem.moreRecordActions', [record.title])
              "
              variant="ghost"
              size="icon-sm"
              ><EllipsisIcon class="size-4" /></Button
          ></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="isExpanded = !isExpanded">{{
              isExpanded
                ? i18n.t('downloadLibraryItem.hideDetails')
                : i18n.t('downloadLibraryItem.viewDetails')
            }}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              @select="emit('remove', record.identity)"
              :disabled="isBusy"
              class="text-destructive"
              >{{
                i18n.t('downloadLibraryItem.deleteRecord')
              }}</DropdownMenuItem
            >
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CollapsibleContent
        class="border-t bg-muted/50 px-4 py-4 text-xs leading-6 sm:px-5"
      >
        <dl class="space-y-2">
          <div>
            <dt class="text-muted-foreground">
              {{ i18n.t('downloadLibraryItem.videoAndPart') }}
            </dt>
            <dd class="wrap-break-word">
              {{ record.bvid
              }}<template v-if="record.kind !== 'cover'">
                · P{{ record.page }} {{ record.part }}</template
              >
            </dd>
          </div>
          <div v-if="record.filename">
            <dt class="text-muted-foreground">
              {{ i18n.t('downloadLibraryItem.savePath') }}
            </dt>
            <dd class="break-all">{{ record.filename }}</dd>
          </div>
          <div v-if="record.kind === 'video'">
            <dt class="text-muted-foreground">
              {{ i18n.t('downloadLibraryItem.originalQualityPreference') }}
            </dt>
            <dd>{{ QUALITY_LABELS[record.qualityPreference] }}</dd>
          </div>
          <div v-if="record.kind === 'subtitle'">
            <dt class="text-muted-foreground">
              {{ i18n.t('batchImportOptions.subtitleLanguage') }}
            </dt>
            <dd>{{ SUBTITLE_LANGUAGE_LABELS[record.subtitleLanguage] }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">
              {{
                record.completedAt === undefined
                  ? i18n.t('downloadLibraryItem.createdTimeCompletionUnknown')
                  : i18n.t('downloadLibraryItem.completedTime')
              }}
            </dt>
            <dd>{{ date.toLocaleString(i18n.t('localeCode')) }}</dd>
          </div>
        </dl>
        <CollapsibleTrigger as-child
          ><Button
            variant="ghost"
            size="xs"
            class="mt-3 text-muted-foreground"
            >{{ i18n.t('downloadLibraryItem.hideDetails')
            }}<ChevronDownIcon class="size-3 rotate-180" /></Button
        ></CollapsibleTrigger>
      </CollapsibleContent>
    </Collapsible>
  </li>
</template>
