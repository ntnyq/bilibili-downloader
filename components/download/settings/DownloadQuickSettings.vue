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
import { DOWNLOAD_KIND_LABELS } from '~/utils/downloads/labels'
import { i18n } from '~/utils/i18n'

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
    :title="i18n.t('downloadQuickSettings.quickDownloadOnVideoPages')"
    :description="
      i18n.t('downloadQuickSettings.clickThePageDownloadButtonToOpenThe')
    "
    auto-save
  >
    <template #icon><MousePointerClickIcon class="size-4.5" /></template>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Label for="double-click-kind">{{
        i18n.t('downloadQuickSettings.doubleClickDownloadContent')
      }}</Label>
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
          ><SelectValue>{{
            DOWNLOAD_KIND_LABELS[settings.doubleClickKind]
          }}</SelectValue></SelectTrigger
        >
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
      {{ i18n.t('downloadQuickSettings.byDefaultDownloadTheCurrentPartAtThe') }}
    </p>
    <Alert
      v-if="settingsError"
      variant="destructive"
      class="mt-3"
      ><AlertDescription>{{ settingsError }}</AlertDescription></Alert
    >
  </DownloadSettingsSection>
</template>
