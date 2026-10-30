<script lang="ts" setup>
import { provideOverlayTarget } from '~/composables/useOverlayTarget'
import { parseVideoLocation } from '~/utils/downloads/parseVideoLocation'
import { i18n } from '~/utils/i18n'

const props = defineProps<{
  getUrl: () => string
}>()
const overlayTargetRef = useTemplateRef<HTMLDivElement>('overlayTargetRef')
provideOverlayTarget(overlayTargetRef)

const url = computed(() => props.getUrl())
const isVideoPage = computed(() => !!parseVideoLocation(url.value))
</script>

<template>
  <div
    v-if="isVideoPage"
    :lang="i18n.t('localeCode')"
  >
    <DownloadLauncher :url />
    <div ref="overlayTargetRef" />
  </div>
</template>
