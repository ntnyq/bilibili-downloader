<script lang="ts" setup>
import { FilesIcon, FolderDownIcon, LayersIcon, VideoIcon } from '@lucide/vue'
import { i18n } from '~/utils/i18n'

const FEATURES = [
  {
    get title() {
      return i18n.t('welcomeFeatureCards.exportTheAssetsYouNeed')
    },
    icon: FilesIcon,
    get description() {
      return i18n.t(
        'welcomeFeatureCards.chooseAudioCoversSubtitlesOrDanmakuUnderDownload',
      )
    },
    get detail() {
      return i18n.t('welcomeFeatureCards.audioIsSavedAsM4aEachVideoGets')
    },
    get note() {
      return i18n.t('welcomeFeatureCards.specificReasonsAreShownWhenAnAssetIs')
    },
  },
  {
    get title() {
      return i18n.t('welcomeFeatureCards.oneVideoOneClick')
    },
    icon: VideoIcon,
    get description() {
      return i18n.t(
        'welcomeFeatureCards.openARegularBilibiliVideoAndClickDownload',
      )
    },
    get detail() {
      return i18n.t('welcomeFeatureCards.youCanAlsoOpenTheDownloadPanelFrom')
    },
    get note() {
      return i18n.t(
        'welcomeFeatureCards.theBestQualityAvailableToYourAccountIs',
      )
    },
  },
  {
    get title() {
      return i18n.t('welcomeFeatureCards.chooseYourVideoParts')
    },
    icon: LayersIcon,
    get description() {
      return i18n.t(
        'welcomeFeatureCards.downloadTheCurrentPartByDefaultOrChoose',
      )
    },
    get detail() {
      return i18n.t(
        'welcomeFeatureCards.selectPartsIndividuallySelectAllOrInvertYour',
      )
    },
    get note() {
      return i18n.t('welcomeFeatureCards.eachPartIsSavedAsASeparateMp4')
    },
  },
  {
    get title() {
      return i18n.t('welcomeFeatureCards.trackProgressInTheDownloadCenter')
    },
    icon: FolderDownIcon,
    get description() {
      return i18n.t('welcomeFeatureCards.downloadsRunInABackgroundTabWhereYou')
    },
    get detail() {
      return i18n.t(
        'welcomeFeatureCards.pausingTheQueueLetsTheCurrentTaskFinish',
      )
    },
    get note() {
      return i18n.t(
        'welcomeFeatureCards.keepTheDownloadCenterOpenClosingOrRefreshing',
      )
    },
  },
]
</script>

<template>
  <ul class="grid gap-4 sm:grid-cols-2 sm:gap-5">
    <li
      v-for="feature in FEATURES"
      :key="feature.title"
      class="min-w-0"
    >
      <Card class="h-full gap-0 p-5 shadow-none sm:p-6">
        <div class="mb-4 flex items-center gap-3">
          <span
            class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"
          >
            <component
              :is="feature.icon"
              :stroke-width="1.75"
              class="size-5.5"
              aria-hidden="true"
            />
          </span>
          <h2 class="text-base font-semibold tracking-tight sm:text-[17px]">
            {{ feature.title }}
          </h2>
        </div>
        <p class="text-sm leading-7">{{ feature.description }}</p>
        <p class="mt-2 pb-5 text-[13px] text-muted-foreground leading-6">
          {{ feature.detail }}
        </p>
        <p
          class="mt-auto border-t pt-3 text-xs text-muted-foreground leading-5"
        >
          {{ feature.note }}
        </p>
      </Card>
    </li>
  </ul>
</template>
