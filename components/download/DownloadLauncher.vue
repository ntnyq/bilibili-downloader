<script lang="ts" setup>
import { DownloadIcon, LoaderCircleIcon, XIcon } from '@lucide/vue'
import {
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
} from 'reka-ui'
import { useOverlayTarget } from '~/composables/useOverlayTarget'
import { useQuickDownload } from '~/composables/useQuickDownload'
import { createDownloadClickHandler } from '~/utils/downloads/launcher'
import { i18n } from '~/utils/i18n'

const props = defineProps<{
  url: string
}>()
const overlayTarget = useOverlayTarget()
const {
  isAdding,
  error: downloadError,
  notice,
  hint,
  download,
  clearFeedback,
} = useQuickDownload(() => props.url)

const isOpen = shallowRef(false)

const anchorRef = useTemplateRef<HTMLSpanElement>('anchorRef')
const triggerRef = useTemplateRef('triggerRef')

const clicks = createDownloadClickHandler({
  open() {
    clearFeedback()
    isOpen.value = !isOpen.value
  },
  download() {
    isOpen.value = false
    download()
  },
})

function keepAnchorInteraction(event: {
  preventDefault: () => void
  detail: { originalEvent: Event }
}) {
  if (
    anchorRef.value
    && event.detail.originalEvent.composedPath().includes(anchorRef.value)
  ) {
    event.preventDefault()
  }
}

function close() {
  isOpen.value = false
  triggerRef.value?.focus()
}

watch(
  () => props.url,
  () => {
    clicks.cancel()
    isOpen.value = false
  },
)

onScopeDispose(clicks.cancel)
</script>

<template>
  <div class="bili-font relative inline-flex align-middle">
    <PopoverRoot v-model:open="isOpen">
      <PopoverAnchor as-child>
        <span
          ref="anchorRef"
          class="inline-flex"
        >
          <Button
            @click="clicks.click($event.detail)"
            @dblclick.prevent
            ref="triggerRef"
            :disabled="isAdding"
            :title="hint"
            :aria-label="hint"
            :aria-expanded="isOpen"
            aria-haspopup="dialog"
            variant="ghost"
            size="sm"
            class="h-8 gap-1.5 px-2 text-[13px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LoaderCircleIcon
              v-if="isAdding"
              class="size-4 animate-spin"
              aria-hidden="true"
            />
            <DownloadIcon
              v-else
              class="size-4"
              aria-hidden="true"
            />
            {{
              isAdding
                ? i18n.t('downloadLauncher.adding')
                : i18n.t('downloadLauncher.download')
            }}
          </Button>
        </span>
      </PopoverAnchor>
      <PopoverPortal :to="overlayTarget ?? undefined">
        <PopoverContent
          @keydown.esc.stop.prevent="close"
          @interact-outside="keepAnchorInteraction"
          :aria-labelledby="undefined"
          :side-offset="10"
          :collision-padding="12"
          :aria-label="i18n.t('extensionName')"
          align="end"
          side="bottom"
          class="z-50 w-100 max-w-[calc(100vw-24px)] rounded-lg shadow-xl outline-none"
        >
          <DownloadPanel
            :url
            :style="{
              maxHeight:
                'min(600px, var(--reka-popover-content-available-height))',
            }"
          >
            <template #header-actions>
              <PopoverClose as-child>
                <Button
                  @click="close"
                  :aria-label="i18n.t('downloadLauncher.closeDownloadPanel')"
                  variant="ghost"
                  size="icon-sm"
                >
                  <XIcon
                    class="size-4"
                    aria-hidden="true"
                  />
                </Button>
              </PopoverClose>
            </template>
          </DownloadPanel>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <div
      v-if="downloadError || notice"
      :role="downloadError ? 'alert' : 'status'"
      :class="downloadError ? 'text-destructive' : 'text-foreground'"
      class="fixed right-4 bottom-4 z-50 flex w-75 max-w-[calc(100vw-24px)] items-start gap-2 rounded-lg border bg-background p-3 text-xs leading-5 shadow-lg"
    >
      <p class="flex-1">{{ downloadError || notice }}</p>
      <Button
        @click="clearFeedback"
        :aria-label="i18n.t('downloadLauncher.dismissNotification')"
        variant="ghost"
        size="icon-sm"
        class="size-5 shrink-0"
      >
        <XIcon
          class="size-3"
          aria-hidden="true"
        />
      </Button>
    </div>
  </div>
</template>
