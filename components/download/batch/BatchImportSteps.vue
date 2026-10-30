<script lang="ts" setup>
import { CheckIcon } from '@lucide/vue'
import { i18n } from '~/utils/i18n'

const props = defineProps<{
  step: number
}>()
const steps = computed(() => [
  i18n.t('batchImportSteps.chooseSource'),
  i18n.t('batchImportSteps.reviewVideos'),
  i18n.t('batchImportSteps.addToQueue'),
])

function getStepClasses(index: number) {
  if (props.step === index + 1) {
    return 'bg-primary text-primary-foreground'
  }
  return props.step > index + 1
    ? 'bg-success/10 text-success'
    : 'bg-secondary text-muted-foreground'
}
</script>

<template>
  <ol
    :aria-label="i18n.t('batchImportSteps.batchImportSteps')"
    class="mb-6 grid grid-cols-3 items-start gap-2 sm:flex sm:items-center sm:gap-4"
  >
    <li
      v-for="(label, index) in steps"
      :key="label"
      :aria-current="step === index + 1 ? 'step' : undefined"
      :class="index < steps.length - 1 && 'flex-1'"
      class="flex min-w-0 items-center gap-2 sm:gap-4"
    >
      <span
        :class="step === index + 1 ? 'text-primary' : 'text-muted-foreground'"
        class="flex min-w-0 flex-1 flex-col items-center gap-2 text-center text-xs sm:flex-none sm:shrink-0 sm:flex-row sm:text-left"
      >
        <span
          :class="getStepClasses(index)"
          class="flex size-6 shrink-0 items-center justify-center rounded-full font-medium"
        >
          <CheckIcon
            v-if="step > index + 1"
            class="size-3.5"
            aria-hidden="true"
          />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span class="min-w-0 leading-4">{{ label }}</span>
      </span>
      <span
        v-if="index < steps.length - 1"
        class="hidden h-px min-w-2 flex-1 bg-border sm:block"
        aria-hidden="true"
      />
    </li>
  </ol>
</template>
