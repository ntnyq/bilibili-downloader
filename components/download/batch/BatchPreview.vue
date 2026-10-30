<script lang="ts" setup>
import { CheckIcon, LoaderCircleIcon } from '@lucide/vue'
import type { BatchImportRow } from '~/composables/useBatchImport'

const props = defineProps<{
  rows: BatchImportRow[]
  disabled: boolean
}>()
const emit = defineEmits<{
  toggle: [key: string]
  toggleAll: []
}>()
const available = computed(() =>
  props.rows.filter(
    row =>
      !row.receipt && (row.status === 'pending' || row.status === 'failed'),
  ),
)
const selectedCount = computed(
  () => available.value.filter(row => row.selected).length,
)
const allSelected = computed(
  () =>
    !!available.value.length && selectedCount.value === available.value.length,
)

function isRowDisabled(row: BatchImportRow) {
  return (
    props.disabled
    || !!row.receipt
    || row.status === 'done'
    || row.status === 'partial'
  )
}

function getRowBadgeClasses(row: BatchImportRow) {
  if (row.status === 'failed' || row.status === 'partial') {
    return 'bg-destructive/10 text-destructive'
  }
  if (row.status === 'done') {
    return 'bg-success/10 text-success'
  }
  return row.selected
    ? 'bg-accent text-primary'
    : 'bg-muted text-muted-foreground'
}

function getRowStatusLabel(row: BatchImportRow) {
  switch (row.status) {
    case 'adding':
      return '加入中'
    case 'done':
      return '已处理'
    case 'partial':
      return '部分完成'
    case 'failed':
      return '失败'
    default:
      return row.selected ? '已选择' : '未选择'
  }
}
</script>

<template>
  <div class="overflow-hidden">
    <Label
      class="flex items-center gap-2.25 border-b border-border bg-muted/60 px-5 py-3 text-[12px]"
    >
      <Checkbox
        @update:model-value="emit('toggleAll')"
        :model-value="
          selectedCount > 0 && !allSelected ? 'indeterminate' : allSelected
        "
        :disabled="disabled || !available.length"
        class="h-3.75 w-3.75 shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      全选待加入视频
      <span class="ml-auto text-muted-foreground"
        >已选 {{ selectedCount }} / {{ rows.length }}</span
      >
    </Label>
    <ScrollArea :style="{ height: `${Math.min(rows.length * 84, 384)}px` }"
      ><ul
        class="divide-y divide-border"
        aria-label="预览视频列表"
      >
        <li
          v-for="row in rows"
          :key="row.key"
          :class="row.selected && 'bg-accent/25'"
          class="flex min-h-20 items-start gap-3 px-4 py-4 sm:px-5"
        >
          <Checkbox
            @update:model-value="emit('toggle', row.key)"
            :model-value="row.selected"
            :disabled="isRowDisabled(row)"
            :aria-label="`选择 ${row.item.title} P${row.item.page}`"
            class="mt-0.75 h-3.75 w-3.75 shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <div class="min-w-0 flex-1">
            <a
              :href="`https://www.bilibili.com/video/${row.item.videoId}/?p=${row.item.page}`"
              target="_blank"
              rel="noreferrer"
              class="line-clamp-2 break-all text-[13px] font-medium leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:text-primary"
              >{{ row.item.title }}</a
            >
            <p class="mt-0.75 break-all text-[11px] text-muted-foreground">
              {{ row.item.videoId }} · P{{ row.item.page }}
            </p>
            <p
              v-if="row.outcome"
              :class="
                row.status === 'failed' || row.status === 'partial'
                  ? 'text-destructive'
                  : 'text-primary'
              "
              class="mt-1.25 wrap-break-word text-[11px] leading-4.5"
            >
              {{ row.outcome }}
            </p>
          </div>
          <Badge
            :class="getRowBadgeClasses(row)"
            variant="secondary"
            class="mt-0.5 shrink-0 gap-1 text-[11px] font-normal"
          >
            <LoaderCircleIcon
              v-if="row.status === 'adding'"
              class="size-3 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <CheckIcon
              v-if="row.status === 'done'"
              class="size-3"
              aria-hidden="true"
            />
            {{ getRowStatusLabel(row) }}
          </Badge>
        </li>
      </ul></ScrollArea
    >
  </div>
</template>
