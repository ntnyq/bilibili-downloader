<script lang="ts" setup>
import { z } from 'zod'
import { getErrorMessage } from '~/utils/downloads/getErrorMessage'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import { i18n } from '~/utils/i18n'
import type { SubtitleLanguage } from '~/types/download'

interface Props {
  /**
   * Canonical video identifier.
   */
  bvid: string
  /**
   * Content identifier of the selected part.
   */
  cid: number
  /**
   * Language preference shared with the SRT download.
   */
  subtitleLanguage: SubtitleLanguage
}

const props = defineProps<Props>()
const isCopying = shallowRef(false)
const copied = shallowRef(false)
const copyError = shallowRef('')
const copyLabel = computed(() => {
  if (isCopying.value) {
    return i18n.t('downloadPanel.copyingSubtitleText')
  }
  return copied.value
    ? i18n.t('downloadPanel.copiedSubtitleText')
    : i18n.t('downloadPanel.copySubtitleText')
})
const controller = new AbortController()

async function copy() {
  isCopying.value = true
  copied.value = false
  copyError.value = ''
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      throw new Error(i18n.t('downloadPanel.clipboardUnavailable'))
    }
    const content = sendDownloadMessage(
      {
        type: 'subtitle.text',
        bvid: props.bvid,
        cid: props.cid,
        subtitleLanguage: props.subtitleLanguage,
      },
      z.string().min(1),
    ).then(text => {
      controller.signal.throwIfAborted()
      return new Blob([text], { type: 'text/plain' })
    })
    // Start the clipboard write within the click's user activation.
    await Promise.all([
      content,
      navigator.clipboard.write([new ClipboardItem({ 'text/plain': content })]),
    ])
    copied.value = true
  } catch (error_) {
    copyError.value = i18n.t('downloadPanel.copySubtitleFailed', [
      getErrorMessage(error_),
    ])
  } finally {
    isCopying.value = false
  }
}

onScopeDispose(() => {
  controller.abort()
})
</script>

<template>
  <Button
    @click="copy"
    :disabled="isCopying"
    type="button"
    variant="outline"
    class="h-10"
  >
    <span aria-live="polite">{{ copyLabel }}</span>
  </Button>
  <p
    v-if="copyError"
    class="basis-full leading-5 text-destructive"
    role="alert"
  >
    {{ copyError }}
  </p>
</template>
