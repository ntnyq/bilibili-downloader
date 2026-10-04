<script lang="ts" setup>
import { provideOverlayTarget } from '~/composables/useOverlayTarget'
import { parseVideoLocation } from '~/utils/downloads/model'

const props = defineProps<{ getUrl: () => string }>()
const overlayTarget = useTemplateRef<HTMLDivElement>('overlayTarget')
provideOverlayTarget(overlayTarget)

const url = computed(() => props.getUrl())
const isVideoPage = computed(() => !!parseVideoLocation(url.value))
</script>

<template>
  <div
    v-if="isVideoPage"
    class="my-[16px] w-full"
  >
    <DownloadPanel
      :url
      embedded
    />
    <div ref="overlayTarget" />
  </div>
</template>
