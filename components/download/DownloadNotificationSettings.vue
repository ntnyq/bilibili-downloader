<script lang="ts" setup>
import { BellIcon } from '@lucide/vue'
import { browser } from '#imports'
import { useDownloadSettings } from '~/composables/useDownloadSettings'
import { errorMessage } from '~/utils/downloads/model'

const {
  settings,
  isReady,
  isSaving,
  error: settingsError,
  updateSettings,
} = useDownloadSettings()
const isRequesting = shallowRef(false)
const notice = shallowRef('')
const notificationError = shallowRef('')

async function toggleNotifications(enabled: boolean) {
  if (!isReady.value || isSaving.value || isRequesting.value) {
    return
  }
  notificationError.value = ''
  notice.value = ''
  isRequesting.value = true
  try {
    // Keep the permission request on the original user gesture.
    if (
      enabled
      && !(await browser.permissions.request({
        permissions: ['notifications'],
      }))
    ) {
      throw new Error('未获得通知权限；文件下载不受影响。')
    }
    if (await updateSettings({ notifyOnComplete: enabled })) {
      notice.value = enabled ? '完成通知已开启。' : '完成通知已关闭。'
    }
  } catch (error_) {
    notificationError.value = errorMessage(error_)
  } finally {
    isRequesting.value = false
  }
}
</script>

<template>
  <DownloadSettingsSection
    title="完成通知"
    description="下载完成后及时提醒。"
    auto-save
  >
    <template #icon><BellIcon class="size-[18px]" /></template>
    <div class="flex items-center justify-between gap-4">
      <div>
        <h3 class="text-sm font-medium">系统通知</h3>
        <p class="mt-1 text-xs text-muted-foreground">
          文件保存完成后发送通知。
        </p>
      </div>
      <Switch
        @update:model-value="toggleNotifications"
        :model-value="settings.notifyOnComplete"
        :disabled="!isReady || isSaving || isRequesting"
        aria-label="文件保存完成后发送系统通知"
      />
    </div>
    <p class="mt-4 text-[11px] text-muted-foreground leading-5">
      通知是否显示，还取决于浏览器和系统设置。
    </p>
    <Alert
      v-if="notificationError || settingsError"
      variant="destructive"
      class="mt-3"
      ><AlertDescription>{{
        notificationError || settingsError
      }}</AlertDescription></Alert
    >
    <p
      v-if="notice"
      class="mt-3 text-xs text-primary"
      role="status"
    >
      {{ notice }}
    </p>
  </DownloadSettingsSection>
</template>
