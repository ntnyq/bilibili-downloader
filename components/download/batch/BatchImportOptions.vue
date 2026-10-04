<script lang="ts" setup>
import { ChevronDownIcon, Settings2Icon } from '@lucide/vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  DOWNLOAD_KIND_LABELS,
  SUBTITLE_LANGUAGE_LABELS,
} from '~/utils/downloads/assets'
import { QUALITY_LABELS } from '~/utils/downloads/quality'
import type {
  DownloadKind,
  QualityPreference,
  SubtitleLanguage,
} from '~/types/download'

defineProps<{ disabled: boolean }>()
const kind = defineModel<DownloadKind>('kind', { required: true })
const subtitleLanguage = defineModel<SubtitleLanguage>('subtitleLanguage', {
  required: true,
})
const quality = defineModel<QualityPreference>('quality', { required: true })
const mode = defineModel<'current' | 'all'>('mode', { required: true })
const skipCompleted = defineModel<boolean>('skipCompleted', { required: true })
const isExpanded = shallowRef(false)
const rangeLabel = computed(() =>
  kind.value === 'cover'
    ? '每个视频一张封面'
    : mode.value === 'all'
      ? '每个视频的全部 P'
      : '链接指定 P / 首个 P',
)
</script>

<template>
  <Collapsible
    v-model:open="isExpanded"
    class="mt-5 rounded-xl border bg-background p-4 sm:p-5"
  >
    <div class="flex items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 text-sm font-medium">
        <Settings2Icon
          class="size-4"
          aria-hidden="true"
        />下载选项
      </h3>
      <CollapsibleTrigger as-child
        ><Button
          variant="ghost"
          size="xs"
          >{{ isExpanded ? '收起选项' : disabled ? '查看选项' : '修改选项'
          }}<ChevronDownIcon
            :class="isExpanded && 'rotate-180'"
            class="size-3"
            aria-hidden="true" /></Button
      ></CollapsibleTrigger>
    </div>
    <dl class="my-4 grid gap-3 text-xs sm:grid-cols-3 sm:divide-x">
      <div>
        <dt class="mb-1 text-muted-foreground">下载内容</dt>
        <dd>{{ DOWNLOAD_KIND_LABELS[kind] }}</dd>
      </div>
      <div class="sm:pl-4">
        <dt class="mb-1 text-muted-foreground">
          {{
            kind === 'video'
              ? '画质偏好'
              : kind === 'subtitle'
                ? '字幕语言'
                : '保存格式'
          }}
        </dt>
        <dd>
          {{
            kind === 'video'
              ? QUALITY_LABELS[quality]
              : kind === 'subtitle'
                ? SUBTITLE_LANGUAGE_LABELS[subtitleLanguage]
                : DOWNLOAD_KIND_LABELS[kind]
          }}
        </dd>
      </div>
      <div class="sm:pl-4">
        <dt class="mb-1 text-muted-foreground">分 P 范围</dt>
        <dd>{{ rangeLabel }}</dd>
      </div>
    </dl>
    <Label class="flex items-center gap-2 text-xs text-muted-foreground"
      ><Checkbox
        v-model="skipCompleted"
        :disabled
      />跳过已完成的相同内容</Label
    >
    <CollapsibleContent class="mt-4 border-t pt-1">
      <div class="grid gap-x-7 sm:grid-cols-2">
        <div>
          <DownloadAssetPicker
            v-model:kind="kind"
            v-model:subtitle-language="subtitleLanguage"
            :disabled
          />
          <DownloadQuality
            v-model="quality"
            v-if="kind === 'video'"
            :disabled
          />
        </div>
        <div class="mt-[18px]">
          <div
            v-if="kind !== 'cover'"
            class="flex items-center justify-between gap-[12px] text-[12px]"
          >
            <Label
              as="span"
              class="shrink-0 text-muted-foreground"
              >分 P 范围</Label
            >
            <Select
              v-model="mode"
              :disabled
              ><SelectTrigger
                aria-label="分 P 范围"
                class="w-[190px] max-w-full"
                ><SelectValue /></SelectTrigger
              ><SelectContent>
                <SelectItem value="current">链接指定 P / 首个 P</SelectItem>
                <SelectItem value="all">每个视频的全部 P</SelectItem>
              </SelectContent></Select
            >
          </div>
          <p class="mt-[10px] text-[11px] text-muted-foreground leading-[18px]">
            {{
              kind === 'cover'
                ? '每个视频保存一张封面。'
                : '链接中的 p 参数指定分 P；收藏夹、合集和投稿默认取首个 P。选择全部 P 后逐个展开。'
            }}
          </p>
          <p class="mt-[6px] text-[11px] text-muted-foreground leading-[18px]">
            依据本机的已下载记录，同一分 P、同一下载内容只加入一次。最多保留
            5000 条、3
            MiB，超出后移除最早记录；清除记录后无法识别。排队中的相同任务始终跳过。
          </p>
        </div>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
