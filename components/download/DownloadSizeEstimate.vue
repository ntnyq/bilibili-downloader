<script lang="ts" setup>
import { z } from 'zod'
import { formatBytes } from '~/utils/downloads/format'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import { i18n } from '~/utils/i18n'
import type { QualityPreference, VideoPage } from '~/types/download'

interface Props {
  /**
   * Canonical video identifier.
   */
  bvid: string
  epId?: number
  /**
   * Current part whose selected tracks will be estimated.
   */
  part: VideoPage
  /**
   * Quality preference shared with the video download.
   */
  quality: QualityPreference
}

const props = defineProps<Props>()

const bytes = shallowRef<number>()
const isEstimating = shallowRef(false)
const estimateError = shallowRef('')

async function estimate() {
  isEstimating.value = true
  estimateError.value = ''

  try {
    bytes.value = await sendDownloadMessage(
      {
        type: 'video.estimate',
        bvid: props.bvid,
        epId: props.epId,
        cid: props.part.cid,
        duration: props.part.duration,
        quality: props.quality,
      },
      z.number().int().nonnegative(),
    )
  } catch (error_) {
    estimateError.value = i18n.t('downloadPanel.estimateSizeFailed', [
      getErrorMessage(error_),
    ])
  } finally {
    isEstimating.value = false
  }
}
</script>

<template>
  <span
    class="border-s ps-2 font-semibold"
    role="status"
  >
    <button
      @click="estimate"
      v-if="bytes === undefined"
      :disabled="isEstimating"
      type="button"
      class="text-primary hover:underline disabled:opacity-50"
    >
      {{
        isEstimating
          ? i18n.t('downloadPanel.estimatingSize')
          : i18n.t('downloadPanel.estimateSize')
      }}
    </button>
    <span
      v-else
      class="text-foreground"
    >
      {{
        bytes
          ? i18n.t('downloadPanel.estimatedSize', [formatBytes(bytes)])
          : i18n.t('downloadPanel.estimateSizeUnavailable')
      }}
    </span>
  </span>
  <p
    v-if="estimateError"
    class="order-last basis-full text-destructive"
    role="alert"
  >
    {{ estimateError }}
  </p>
</template>
