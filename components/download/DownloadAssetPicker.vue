<script lang="ts" setup>
import {
  CaptionsIcon,
  ImageIcon,
  MessageSquareIcon,
  Music2Icon,
  VideoIcon,
} from '@lucide/vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  DOWNLOAD_KIND_HINTS,
  DOWNLOAD_KIND_LABELS,
  SUBTITLE_LANGUAGE_LABELS,
} from '~/utils/downloads/assets'
import type { DownloadKind, SubtitleLanguage } from '~/types/download'

defineProps<{
  disabled?: boolean
}>()
const kind = defineModel<DownloadKind>('kind', { required: true })
const subtitleLanguage = defineModel<SubtitleLanguage>('subtitleLanguage', {
  required: true,
})
const groupId = useId()

const ASSETS = [
  { value: 'video', label: '视频', icon: VideoIcon },
  { value: 'audio', label: '音频', icon: Music2Icon },
  { value: 'cover', label: '封面', icon: ImageIcon },
  { value: 'subtitle', label: '字幕', icon: CaptionsIcon },
  { value: 'danmaku', label: '弹幕', icon: MessageSquareIcon },
] as const
</script>

<template>
  <div class="mt-3 space-y-2">
    <fieldset :disabled>
      <legend class="mb-2 text-xs font-medium">下载内容</legend>
      <div class="grid grid-cols-5 gap-1.5">
        <label
          v-for="asset in ASSETS"
          :key="asset.value"
          class="min-w-0"
        >
          <input
            v-model="kind"
            :name="groupId"
            :value="asset.value"
            :aria-label="DOWNLOAD_KIND_LABELS[asset.value]"
            type="radio"
            class="peer sr-only"
          />
          <span
            class="flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 text-[11px] text-muted-foreground peer-checked:border-primary/60 peer-checked:bg-accent peer-checked:font-medium peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
          >
            <component
              :is="asset.icon"
              class="size-4.5"
              aria-hidden="true"
            />
            {{ asset.label }}
          </span>
        </label>
      </div>
    </fieldset>
    <div
      v-if="kind === 'subtitle'"
      class="flex items-center justify-between gap-3 text-[12px]"
    >
      <Label
        as="span"
        class="shrink-0 text-muted-foreground"
        >字幕语言</Label
      >
      <Select
        v-model="subtitleLanguage"
        :disabled
        ><SelectTrigger
          aria-label="字幕语言"
          class="w-47.5 max-w-full"
          ><SelectValue /></SelectTrigger
        ><SelectContent>
          <SelectItem
            v-for="(label, value) in SUBTITLE_LANGUAGE_LABELS"
            :key="value"
            :value
          >
            {{ label }}
          </SelectItem>
        </SelectContent></Select
      >
    </div>
    <p class="text-[11px] text-muted-foreground leading-4.5">
      {{ DOWNLOAD_KIND_HINTS[kind] }}
    </p>
  </div>
</template>
