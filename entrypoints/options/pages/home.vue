<script lang="ts" setup>
import { FolderIcon, InfoIcon, VideoIcon } from '@lucide/vue'
import { useDownloadSettings } from '~/composables/useDownloadSettings'
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
  <div class="bili-font min-h-screen bg-muted">
    <ExtensionHeader />
    <main class="mx-auto max-w-240 px-4 py-8 sm:px-6">
      <div class="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ i18n.t('downloadWorkspace.settings') }}
          </h1>
          <p class="mt-2 text-xs text-muted-foreground">
            {{ i18n.t('home.setDefaultsForNewTasksQueuedTasksKeep') }}
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
          />{{ i18n.t('downloadPanel.downloadCenter') }}</Button
        >
      </div>
      <div class="space-y-4">
        <DownloadLanguageSettings />
        <DownloadSettingsSection
          :title="i18n.t('home.downloadQuality')"
          :description="i18n.t('home.chooseTheDefaultQualityForNewTasks')"
          auto-save
        >
          <template #icon><VideoIcon class="size-4.5" /></template>
          <DownloadQuality
            @update:model-value="updateSettings({ quality: $event })"
            :model-value="settings.quality"
            :disabled="!isReady || isSaving"
            variant="cards"
          />
          <p class="mt-3 text-xs leading-5 text-muted-foreground">
            {{
              i18n.t('home.qualitySettingsAreUpperLimitsActualQualityDepends')
            }}
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
          <p>{{ i18n.t('home.changeTheSaveLocationInYourBrowserS') }}</p>
          <Button
            as="a"
            href="/welcome.html"
            variant="link"
            class="mt-2 px-0 text-primary"
            size="sm"
            >{{ i18n.t('home.viewFullUserGuide') }}</Button
          >
        </div>
      </div>
    </main>
  </div>
</template>
