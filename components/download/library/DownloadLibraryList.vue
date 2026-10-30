<script lang="ts" setup>
import { groupHistoryRecords } from '~/utils/downloads/history/groupHistoryRecords'
import { i18n } from '~/utils/i18n'
import DownloadLibraryItem from './DownloadLibraryItem.vue'
import type { DownloadHistoryRecord } from '~/types/downloadHistory'

const props = defineProps<{
  records: DownloadHistoryRecord[]
  isBusy: boolean
}>()
const emit = defineEmits<{
  requeue: [identity: string]
  remove: [identity: string]
}>()
const groups = computed(() => groupHistoryRecords(props.records))
</script>

<template>
  <div class="space-y-6">
    <section
      v-for="group in groups"
      :key="group.key"
      :aria-label="group.label"
    >
      <div class="mb-2 flex items-center justify-between text-sm">
        <h2 class="font-medium">{{ group.label }}</h2>
        <span class="text-xs text-muted-foreground">{{
          i18n.t('downloadLibraryList.recordsOnThisPage', group.records.length)
        }}</span>
      </div>
      <ul class="divide-y overflow-hidden rounded-xl border bg-background">
        <DownloadLibraryItem
          @requeue="emit('requeue', $event)"
          @remove="emit('remove', $event)"
          v-for="record in group.records"
          :key="record.identity"
          :record
          :is-busy
        />
      </ul>
    </section>
  </div>
</template>
