<script lang="ts" setup>
import { LanguagesIcon } from '@lucide/vue'
import { useLanguageSettings } from '~/composables/useLanguageSettings'
import { i18n } from '~/utils/i18n'

const {
  languagePreference,
  isReady,
  isSaving,
  error: languageError,
  updateLanguage,
} = useLanguageSettings()
const selectedLanguageLabel = computed(() =>
  languagePreference.value === 'browser'
    ? i18n.t('languageSettings.followBrowser')
    : languagePreference.value === 'zh-CN'
      ? i18n.t('languageSettings.simplifiedChinese')
      : 'English',
)
</script>

<template>
  <DownloadSettingsSection
    :title="i18n.t('languageSettings.title')"
    :description="i18n.t('languageSettings.description')"
    auto-save
  >
    <template #icon><LanguagesIcon class="size-4.5" /></template>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Label for="display-language">{{
        i18n.t('languageSettings.label')
      }}</Label>
      <Select
        @update:model-value="updateLanguage"
        :model-value="languagePreference"
        :disabled="!isReady || isSaving"
      >
        <SelectTrigger
          id="display-language"
          class="w-47.5"
          ><SelectValue>{{ selectedLanguageLabel }}</SelectValue></SelectTrigger
        >
        <SelectContent>
          <SelectItem value="browser">{{
            i18n.t('languageSettings.followBrowser')
          }}</SelectItem>
          <SelectItem value="zh-CN">{{
            i18n.t('languageSettings.simplifiedChinese')
          }}</SelectItem>
          <SelectItem value="en">English</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <p class="mt-3 text-xs text-muted-foreground leading-5">
      {{ i18n.t('languageSettings.hint') }}
    </p>
    <Alert
      v-if="languageError"
      variant="destructive"
      class="mt-3"
    >
      <AlertDescription>{{ languageError }}</AlertDescription>
    </Alert>
  </DownloadSettingsSection>
</template>
