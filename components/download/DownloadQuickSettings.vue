<script lang="ts" setup>
import { MousePointerClickIcon } from '@lucide/vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { useDownloadSettings } from '~/composables/useDownloadSettings'
import { downloadKindSchema } from '~/types/download'
import { DOWNLOAD_KIND_LABELS } from '~/utils/downloads/assets'

const {
  settings,
  isReady,
  isSaving,
  error: settingsError,
  updateSettings,
} = useDownloadSettings()
</script>

<template>
  <DownloadSettingsSection
    title="页面快捷下载"
    description="单击页面上的下载按钮打开面板，双击直接下载。"
    auto-save
  >
    <template #icon><MousePointerClickIcon class="size-4.5" /></template>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Label for="double-click-kind">双击下载的资源</Label>
      <Select
        @update:model-value="
          updateSettings({ doubleClickKind: downloadKindSchema.parse($event) })
        "
        :model-value="settings.doubleClickKind"
        :disabled="!isReady || isSaving"
      >
        <SelectTrigger
          id="double-click-kind"
          class="w-47.5"
          ><SelectValue
        /></SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="kind in downloadKindSchema.options"
            :key="kind"
            :value="kind"
          >
            {{ DOWNLOAD_KIND_LABELS[kind] }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <p class="mt-3 text-xs text-muted-foreground leading-5">
      默认下载当前分 P
      的视频，始终使用最高可用画质，不受默认画质设置影响。实际画质取决于当前账号权限。
      封面按整个视频保存一份，字幕自动选择可用语言。
    </p>
    <Alert
      v-if="settingsError"
      variant="destructive"
      class="mt-3"
      ><AlertDescription>{{ settingsError }}</AlertDescription></Alert
    >
  </DownloadSettingsSection>
</template>
