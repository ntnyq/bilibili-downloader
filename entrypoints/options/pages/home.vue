<script lang="ts" setup>
import { FolderIcon, InfoIcon, VideoIcon } from '@lucide/vue'
import { useDownloadSettings } from '~/composables/useDownloadSettings'

const {
  settings,
  isReady,
  isSaving,
  error: settingsError,
  updateSettings,
} = useDownloadSettings()
</script>

<template>
  <div class="bili-font min-h-screen bg-muted">
    <ExtensionHeader />
    <main class="mx-auto max-w-[960px] px-4 py-8 sm:px-6">
      <div class="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">设置</h1>
          <p class="mt-2 text-xs text-muted-foreground">
            调整新任务的默认偏好，已入队的任务保持原设置。
          </p>
        </div>
        <Button
          as="a"
          href="/downloads.html"
          variant="outline"
          size="sm"
          ><FolderIcon
            class="size-4"
            aria-hidden="true"
          />下载中心</Button
        >
      </div>
      <div class="space-y-4">
        <DownloadSettingsSection
          title="下载画质"
          description="选择新任务的默认画质。"
          auto-save
        >
          <template #icon><VideoIcon class="size-[18px]" /></template>
          <DownloadQuality
            @update:model-value="updateSettings({ quality: $event })"
            :model-value="settings.quality"
            :disabled="!isReady || isSaving"
            variant="cards"
          />
          <p class="mt-3 text-xs leading-5 text-muted-foreground">
            画质选项为上限，实际画质取决于当前账号权限。
          </p>
          <Alert
            v-if="settingsError"
            class="mt-3 text-xs text-destructive"
            variant="destructive"
            ><AlertDescription>
              {{ settingsError }}
            </AlertDescription></Alert
          >
        </DownloadSettingsSection>
        <DownloadQuickSettings />
        <DownloadFileSettings />
        <DownloadNotificationSettings />
      </div>
      <div
        class="mt-5 flex items-start gap-2 text-[11px] text-muted-foreground leading-6"
      >
        <InfoIcon
          class="mt-1 size-4 shrink-0"
          aria-hidden="true"
        />
        <div>
          <p>
            更改保存位置请使用浏览器的下载设置。DASH、旧格式视频和独立音轨均支持浏览器磁盘封装，按剩余配额动态预留输入与输出空间。本地助手可按需使用。
          </p>
          <Button
            as="a"
            href="/welcome.html"
            variant="link"
            class="mt-2 px-0 text-primary"
            size="sm"
          >
            查看完整使用说明
          </Button>
        </div>
      </div>
    </main>
  </div>
</template>
