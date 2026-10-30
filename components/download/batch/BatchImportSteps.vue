<script lang="ts" setup>
import { CheckIcon } from '@lucide/vue'

const props = defineProps<{
  step: number
}>()
const steps = ['选择来源', '确认视频', '加入队列']

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
    class="mb-6 flex items-center gap-2 sm:gap-4"
    aria-label="批量导入步骤"
  >
    <li
      v-for="(label, index) in steps"
      :key="label"
      :aria-current="step === index + 1 ? 'step' : undefined"
      :class="index < steps.length - 1 && 'flex-1'"
      class="flex items-center gap-2 sm:gap-4"
    >
      <span
        :class="step === index + 1 ? 'text-primary' : 'text-muted-foreground'"
        class="flex shrink-0 items-center gap-2 text-xs"
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
          <template v-else>{{ index + 1 }}</template> </span
        >{{ label }}
      </span>
      <span
        v-if="index < steps.length - 1"
        class="h-px min-w-2 flex-1 bg-border"
        aria-hidden="true"
      />
    </li>
  </ol>
</template>
