<script lang="ts" setup>
import { provideOverlayTarget } from '~/composables/useOverlayTarget'
import {
  parseEpisodeLocation,
  parseSeasonLocation,
  parseVideoLocation,
} from '~/utils/downloads/parseVideoLocation'
import { i18n } from '~/utils/i18n'

const props = defineProps<{
  getUrl: () => string
}>()

const overlayTargetRef = useTemplateRef<HTMLDivElement>('overlayTargetRef')

provideOverlayTarget(overlayTargetRef)

const url = computed(() => props.getUrl())
const isDownloadPage = computed(
  () =>
    !!(
      parseVideoLocation(url.value)
      || parseEpisodeLocation(url.value)
      || parseSeasonLocation(url.value)
    ),
)
</script>

<template>
  <div
    v-if="isDownloadPage"
    :lang="i18n.t('localeCode')"
  >
    <DownloadLauncher :url />
    <div ref="overlayTargetRef" />
  </div>
</template>
