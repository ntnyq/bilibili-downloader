<script lang="ts" setup>
import { CheckIcon } from '@lucide/vue'
import { i18n } from '~/utils/i18n'
import type { VNode } from 'vue'

interface Props {
  /**
   * Setting group heading.
   */
  title: string
  /**
   * Explanation of what this group controls.
   */
  description: string
  /**
   * Whether edits in this group are persisted immediately.
   */
  autoSave?: boolean
}
defineProps<Props>()
defineSlots<{
  icon: () => VNode[]
  default: () => VNode[]
}>()
const titleId = useId()
</script>

<template>
  <Card
    :aria-labelledby="titleId"
    class="grid gap-5 p-5 shadow-none sm:grid-cols-[188px_minmax(0,1fr)] sm:gap-6 sm:p-6"
  >
    <div>
      <div class="flex items-center gap-2.5">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"
          aria-hidden="true"
          ><slot name="icon"
        /></span>
        <h2
          :id="titleId"
          class="text-[15px] font-semibold"
        >
          {{ title }}
        </h2>
      </div>
      <p class="mt-2 text-xs text-muted-foreground leading-6 sm:ml-11.5">
        {{ description }}
      </p>
      <p
        v-if="autoSave"
        class="mt-2 flex items-center gap-1 text-[11px] text-success sm:ml-11.5"
      >
        <CheckIcon
          class="size-3"
          aria-hidden="true"
        />{{ i18n.t('downloadSettingsSection.savedAutomatically') }}
      </p>
    </div>
    <div class="min-w-0"><slot /></div>
  </Card>
</template>
