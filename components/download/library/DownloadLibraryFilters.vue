<script lang="ts" setup>
import { SearchIcon } from '@lucide/vue'
import { filterLibraryRecords } from '~/utils/downloads/history/library'
import { i18n } from '~/utils/i18n'
import type { VNode } from 'vue'
import type { DownloadKind } from '~/types/download'
import type { DownloadHistoryRecord } from '~/types/downloadHistory'

const props = defineProps<{
  records: DownloadHistoryRecord[]
}>()
defineSlots<{
  actions: () => VNode[]
}>()
const search = defineModel<string>('search', { required: true })
const kind = defineModel<DownloadKind | 'all'>('kind', { required: true })
const kinds = [
  {
    value: 'all',
    get label() {
      return i18n.t('downloadLibraryFilters.allAssets')
    },
  },
  {
    value: 'video',
    get label() {
      return i18n.t('downloadLibraryFilters.video')
    },
  },
  {
    value: 'audio',
    get label() {
      return i18n.t('downloadLibraryFilters.audio')
    },
  },
  {
    value: 'cover',
    get label() {
      return i18n.t('downloadLibraryFilters.cover')
    },
  },
  {
    value: 'subtitle',
    get label() {
      return i18n.t('downloadLibraryFilters.subtitles')
    },
  },
  {
    value: 'danmaku',
    get label() {
      return i18n.t('downloadLibraryFilters.danmaku')
    },
  },
] as const
const filters = computed(() => {
  const matching = filterLibraryRecords(props.records, search.value, 'all')
  return kinds.map(item => ({
    ...item,
    count:
      item.value === 'all'
        ? matching.length
        : matching.filter(record => record.kind === item.value).length,
  }))
})
</script>

<template>
  <div class="mb-5 space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <div class="relative min-w-48 flex-1">
        <SearchIcon
          class="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          v-model="search"
          :aria-label="i18n.t('downloadLibraryFilters.searchDownloadHistory')"
          :placeholder="
            i18n.t('downloadLibraryFilters.searchTitleBvIdUploaderOrSavePath')
          "
          type="search"
          class="h-10 pl-9 text-sm"
        />
      </div>
      <slot name="actions" />
    </div>
    <div
      :aria-label="i18n.t('downloadLibraryFilters.filterHistoryAssets')"
      class="flex flex-wrap gap-1"
      role="group"
    >
      <Button
        @click="kind = item.value"
        v-for="item in filters"
        :key="item.value"
        :aria-pressed="kind === item.value"
        :class="
          kind === item.value
            ? 'bg-accent text-primary'
            : 'text-muted-foreground'
        "
        variant="ghost"
        size="sm"
        type="button"
        class="text-xs"
      >
        {{ item.label }}<span class="tabular-nums">{{ item.count }}</span>
      </Button>
    </div>
  </div>
</template>
