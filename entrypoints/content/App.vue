<script lang="ts" setup>
import { provideOverlayTarget } from '~/composables/useOverlayTarget'
import { parseVideoLocation } from '~/utils/downloads/model'

const props = defineProps<{
  getUrl: () => string
}>()
const overlayTargetRef = useTemplateRef<HTMLDivElement>('overlayTargetRef')
provideOverlayTarget(overlayTargetRef)

const url = computed(() => props.getUrl())
const isVideoPage = computed(() => !!parseVideoLocation(url.value))
</script>

<template>
  <div v-if="isVideoPage">
    <DownloadLauncher :url />
    <div ref="overlayTargetRef" />
  </div>
</template>
