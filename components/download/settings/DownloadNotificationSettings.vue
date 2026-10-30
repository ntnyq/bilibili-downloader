<script lang="ts" setup>
import { BellIcon } from '@lucide/vue'
import { browser } from '#imports'
import { useDownloadSettings } from '~/composables/useDownloadSettings'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { i18n } from '~/utils/i18n'

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
      throw new Error(
        i18n.t(
          'downloadNotificationSettings.notificationPermissionWasNotGrantedDownloadsAreUnaffected',
        ),
      )
    }
    if (await updateSettings({ notifyOnComplete: enabled })) {
      notice.value = enabled
        ? i18n.t('downloadNotificationSettings.completionNotificationsEnabled')
        : i18n.t('downloadNotificationSettings.completionNotificationsDisabled')
    }
  } catch (error_) {
    notificationError.value = getErrorMessage(error_)
  } finally {
    isRequesting.value = false
  }
}
</script>

<template>
  <DownloadSettingsSection
    :title="i18n.t('downloadNotificationSettings.completionNotifications')"
    :description="
      i18n.t('downloadNotificationSettings.getNotifiedWhenDownloadsFinish')
    "
    auto-save
  >
    <template #icon><BellIcon class="size-4.5" /></template>
    <div class="flex items-center justify-between gap-4">
      <div>
        <h3 class="text-sm font-medium">
          {{ i18n.t('downloadNotificationSettings.systemNotifications') }}
        </h3>
        <p class="mt-1 text-xs text-muted-foreground">
          {{
            i18n.t('downloadNotificationSettings.notifyWhenAFileHasBeenSaved')
          }}
        </p>
      </div>
      <Switch
        @update:model-value="toggleNotifications"
        :model-value="settings.notifyOnComplete"
        :disabled="!isReady || isSaving || isRequesting"
        :aria-label="
          i18n.t(
            'downloadNotificationSettings.sendASystemNotificationWhenAFileHas',
          )
        "
      />
    </div>
    <p class="mt-4 text-[11px] text-muted-foreground leading-5">
      {{
        i18n.t(
          'downloadNotificationSettings.notificationsAlsoDependOnYourBrowserAndSystem',
        )
      }}
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
