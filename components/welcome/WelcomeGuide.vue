<script lang="ts" setup>
import { FolderDownIcon, InfoIcon } from '@lucide/vue'
import { useDownloadQueue } from '~/composables/useDownloadQueue'
import { i18n } from '~/utils/i18n'

const { openManager, error: queueError } = useDownloadQueue()
</script>

<template>
  <div class="bili-font min-h-screen bg-muted">
    <ExtensionHeader />
    <main class="mx-auto max-w-240 px-4 py-8 sm:px-8 sm:py-12">
      <div class="mb-8 flex items-start gap-4 sm:mb-10">
        <ExtensionLogo class="size-12 sm:size-14" />
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight sm:text-[28px]">
            {{ i18n.t('welcomeGuide.startSavingWhatYouLove') }}
          </h1>
          <p class="mt-2 text-sm text-muted-foreground leading-6">
            {{ i18n.t('welcomeGuide.saveVideosAsMp4M4aOrIndividualAssets') }}
          </p>
        </div>
      </div>

      <WelcomeFeatureCards />

      <div
        class="mt-6 rounded-xl border bg-background p-5 text-[13px] text-muted-foreground leading-6 sm:p-6"
      >
        <h2
          class="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <InfoIcon
            class="size-4 text-primary"
            aria-hidden="true"
          />{{ i18n.t('welcomeGuide.beforeYouDownload') }}
        </h2>
        <p>
          {{
            i18n.t('welcomeGuide.theBestAvailableQualityIsSelectedByDefault')
          }}
        </p>
        <p class="mt-2.5">
          {{ i18n.t('welcomeGuide.dashLegacyVideoAndSeparateAudioTracksAre') }}
        </p>
        <p class="mt-2.5">
          {{ i18n.t('welcomeGuide.filesAreSavedInTheBilibiliFolderIn') }}
        </p>
      </div>

      <Button
        @click="openManager"
        class="mt-7"
        type="button"
      >
        <FolderDownIcon
          class="size-4 shrink-0"
          aria-hidden="true"
        />{{ i18n.t('welcomeGuide.openDownloadCenter') }}</Button
      >
      <p
        v-if="queueError"
        class="mt-3 text-destructive"
        role="alert"
      >
        {{ queueError }}
      </p>
    </main>
  </div>
</template>
