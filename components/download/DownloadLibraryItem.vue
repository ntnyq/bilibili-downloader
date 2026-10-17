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
  SUBTITLE_LANGUAGE_LABELS,
} from '~/utils/downloads/assets'
import { QUALITY_LABELS } from '~/utils/downloads/quality'
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
  date.value.toLocaleTimeString('zh-CN', {
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
              record.owner || '未知 UP 主'
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
            >再次下载</Button
          >
        </div>
        <div class="flex shrink-0 flex-col items-end gap-2">
          <time
            :datetime="date.toISOString()"
            :title="`${record.completedAt === undefined ? '创建于' : '完成于'} ${date.toLocaleString()}`"
            class="text-[11px] text-muted-foreground tabular-nums"
            >{{ record.completedAt === undefined ? '旧记录' : time }}</time
          >
          <Button
            @click="emit('requeue', record.identity)"
            :disabled="isBusy"
            variant="ghost"
            size="sm"
            type="button"
            class="hidden text-xs text-muted-foreground sm:inline-flex"
            >再次下载</Button
          >
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child
            ><Button
              :aria-label="`更多记录操作：${record.title}`"
              variant="ghost"
              size="icon-sm"
              ><EllipsisIcon class="size-4" /></Button
          ></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @select="isExpanded = !isExpanded">{{
              isExpanded ? '收起详情' : '查看详情'
            }}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              @select="emit('remove', record.identity)"
              :disabled="isBusy"
              class="text-destructive"
              >删除记录</DropdownMenuItem
            >
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CollapsibleContent
        class="border-t bg-muted/50 px-4 py-4 text-xs leading-6 sm:px-5"
      >
        <dl class="space-y-2">
          <div>
            <dt class="text-muted-foreground">视频与分 P</dt>
            <dd class="break-words">
              {{ record.bvid
              }}<template v-if="record.kind !== 'cover'">
                · P{{ record.page }} {{ record.part }}</template
              >
            </dd>
          </div>
          <div v-if="record.filename">
            <dt class="text-muted-foreground">保存路径</dt>
            <dd class="break-all">{{ record.filename }}</dd>
          </div>
          <div v-if="record.kind === 'video'">
            <dt class="text-muted-foreground">原画质偏好</dt>
            <dd>{{ QUALITY_LABELS[record.qualityPreference] }}</dd>
          </div>
          <div v-if="record.kind === 'subtitle'">
            <dt class="text-muted-foreground">字幕语言</dt>
            <dd>{{ SUBTITLE_LANGUAGE_LABELS[record.subtitleLanguage] }}</dd>
          </div>
          <div>
            <dt class="text-muted-foreground">
              {{
                record.completedAt === undefined
                  ? '创建时间（完成时间未知）'
                  : '完成时间'
              }}
            </dt>
            <dd>{{ date.toLocaleString() }}</dd>
          </div>
        </dl>
        <CollapsibleTrigger as-child
          ><Button
            variant="ghost"
            size="xs"
            class="mt-3 text-muted-foreground"
            >收起详情<ChevronDownIcon class="size-3 rotate-180" /></Button
        ></CollapsibleTrigger>
      </CollapsibleContent>
    </Collapsible>
  </li>
</template>
