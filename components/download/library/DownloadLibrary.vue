<script lang="ts" setup>
import { DownloadIcon, EllipsisIcon, HistoryIcon, InfoIcon } from '@lucide/vue'
import { useDownloadHistory } from '~/composables/useDownloadHistory'
import { useDownloadLibrary } from '~/composables/useDownloadLibrary'
import { MAX_LIBRARY_RECORDS } from '~/types/downloadHistory'
import { i18n } from '~/utils/i18n'
import DownloadLibraryFilters from './DownloadLibraryFilters.vue'
import DownloadLibraryList from './DownloadLibraryList.vue'

const {
  records,
  filteredRecords,
  visibleRecords,
  evictedCount,
  page,
  pageCount,
  search,
  kind,
  isReady,
  isBusy,
  isRefreshing,
  error: libraryError,
  notice,
  refresh,
  previousPage,
  nextPage,
  requeue,
  remove,
  clear,
} = useDownloadLibrary()
const {
  isExporting,
  error: exportError,
  notice: exportNotice,
  downloadHistory,
} = useDownloadHistory()
const isClearPending = shallowRef(false)
const emptyTitle = computed(() => {
  if (!isReady.value) {
    return isRefreshing.value
      ? i18n.t('downloadLibrary.loadingDownloadHistory')
      : i18n.t('downloadLibrary.downloadHistoryUnavailable')
  }
  return records.value.length
    ? i18n.t('downloadLibrary.noMatchingDownloadRecords')
    : i18n.t('downloadLibrary.yourSavedCollectionStartsHere')
})
const emptyDescription = computed(() => {
  if (!isReady.value) {
    return i18n.t('downloadLibrary.pleaseTryAgainLater')
  }
  return records.value.length
    ? i18n.t('downloadLibrary.tryDifferentKeywordsOrViewAllAssets')
    : i18n.t(
        'downloadLibrary.successfullyDownloadedAssetsWillAppearHereAutomatically',
      )
})

function resetFilters() {
  search.value = ''
  kind.value = 'all'
}

function clearHistory() {
  isClearPending.value = false
  clear()
}
</script>

<template>
  <section aria-labelledby="download-library-title">
    <DownloadLibraryFilters
      v-model:search="search"
      v-model:kind="kind"
      :records
    >
      <template #actions>
        <DropdownMenu>
          <DropdownMenuTrigger as-child
            ><Button
              :disabled="isExporting || !filteredRecords.length"
              variant="outline"
              ><DownloadIcon class="size-4" />{{
                i18n.t('downloadLibrary.exportRecords')
              }}</Button
            ></DropdownMenuTrigger
          >
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{{
              i18n.t(
                'downloadLibrary.exportFilteredRecords',
                filteredRecords.length,
              )
            }}</DropdownMenuLabel>
            <DropdownMenuItem
              @select="downloadHistory(filteredRecords, 'json')"
              >{{ i18n.t('downloadLibrary.exportJson') }}</DropdownMenuItem
            >
            <DropdownMenuItem
              @select="downloadHistory(filteredRecords, 'csv')"
              >{{ i18n.t('downloadLibrary.exportCsv') }}</DropdownMenuItem
            >
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger as-child
            ><Button
              :aria-label="i18n.t('downloadLibrary.moreHistoryActions')"
              variant="outline"
              size="icon"
              ><EllipsisIcon class="size-4" /></Button
          ></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              @select="refresh"
              :disabled="isRefreshing || isBusy"
              >{{
                isRefreshing
                  ? i18n.t('downloadLibrary.refreshing')
                  : i18n.t('downloadLibrary.refreshRecords')
              }}</DropdownMenuItem
            >
            <DropdownMenuSeparator />
            <DropdownMenuItem
              @select="isClearPending = true"
              :disabled="isBusy || (!records.length && !libraryError)"
              class="text-destructive"
              >{{
                i18n.t('downloadLibrary.clearDownloadHistory')
              }}</DropdownMenuItem
            >
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </DownloadLibraryFilters>
    <h2
      id="download-library-title"
      class="sr-only"
    >
      {{ i18n.t('downloadWorkspace.downloadHistory') }}
    </h2>
    <p
      v-if="evictedCount"
      class="mb-4 text-xs text-muted-foreground"
    >
      {{
        i18n.t(
          'downloadLibrary.oldRecordsWereRemovedDueToStorageLimits',
          evictedCount,
        )
      }}
    </p>
    <AlertDialog v-model:open="isClearPending">
      <AlertDialogContent>
        <AlertDialogHeader
          ><AlertDialogTitle>{{
            i18n.t('downloadLibrary.clearDownloadHistory2')
          }}</AlertDialogTitle
          ><AlertDialogDescription>{{
            i18n.t(
              'downloadLibrary.afterClearingBatchImportsWillNoLongerSkip',
              [
                isReady
                  ? i18n.t('downloadLibrary.allRecords', records.length)
                  : i18n.t('downloadLibrary.theUnreadableDownloadHistory'),
              ],
            )
          }}</AlertDialogDescription></AlertDialogHeader
        >
        <AlertDialogFooter
          ><AlertDialogCancel>{{
            i18n.t('downloadLibrary.keepRecords')
          }}</AlertDialogCancel
          ><AlertDialogAction
            @click="clearHistory"
            :disabled="isBusy"
            >{{ i18n.t('downloadLibrary.confirmClear') }}</AlertDialogAction
          ></AlertDialogFooter
        >
      </AlertDialogContent>
    </AlertDialog>
    <Alert
      v-if="libraryError || exportError"
      variant="destructive"
      class="mb-4 text-sm text-destructive"
      ><AlertDescription>
        {{ libraryError || exportError }}
      </AlertDescription></Alert
    >
    <p
      v-if="notice || exportNotice"
      role="status"
      class="mb-4 text-sm text-primary"
    >
      {{ notice || exportNotice }}
    </p>
    <DownloadLibraryList
      @requeue="requeue"
      @remove="remove"
      v-if="visibleRecords.length"
      :records="visibleRecords"
      :is-busy
    />
    <div
      v-else
      class="rounded-xl border bg-background px-4 py-12 text-center"
      role="status"
    >
      <HistoryIcon
        class="mx-auto mb-4 size-8 text-primary"
        aria-hidden="true"
      />
      <p class="text-sm font-medium">
        {{ emptyTitle }}
      </p>
      <p class="mt-2 text-xs text-muted-foreground">
        {{ emptyDescription }}
      </p>
      <Button
        @click="resetFilters"
        v-if="isReady && records.length"
        variant="outline"
        size="sm"
        class="mt-4"
        >{{ i18n.t('downloadLibrary.clearFilters') }}</Button
      >
      <Button
        @click="refresh"
        v-if="!isReady && !isRefreshing"
        variant="outline"
        size="sm"
        class="mt-4"
        >{{ i18n.t('downloadPanel.reload') }}</Button
      >
    </div>
    <Collapsible
      class="mt-6 rounded-lg bg-secondary px-4 py-3 text-xs text-muted-foreground"
    >
      <div class="flex flex-wrap items-center gap-2">
        <InfoIcon
          class="size-4 shrink-0"
          aria-hidden="true"
        />
        <p class="min-w-0 flex-1">
          {{
            i18n.t(
              'downloadLibrary.downloadRecordsAreStoredHereRemovingARecord',
            )
          }}
        </p>
        <CollapsibleTrigger as-child>
          <Button
            variant="ghost"
            size="xs"
            >{{ i18n.t('downloadLibrary.learnMore') }}</Button
          >
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent class="mt-3 space-y-2 leading-6">
        <p>
          {{
            i18n.t(
              'downloadLibrary.theMostRecentSuccessfulDownloadOfEachAsset',
              [MAX_LIBRARY_RECORDS],
            )
          }}
        </p>
        <p>
          {{
            i18n.t(
              'downloadLibrary.deletingRecordsPreventsBatchImportsFromSkippingThose',
            )
          }}
        </p>
      </CollapsibleContent>
    </Collapsible>
    <nav
      v-if="filteredRecords.length"
      :aria-label="i18n.t('downloadLibrary.downloadHistoryPagination')"
      class="mt-5 flex flex-wrap items-center justify-end gap-3 text-xs"
    >
      <span class="mr-auto text-muted-foreground">{{
        i18n.t('downloadLibrary.matchingRecords', filteredRecords.length)
      }}</span>
      <span class="text-muted-foreground">{{
        i18n.t('downloadLibrary.page20PerPage', [page, pageCount])
      }}</span>
      <Button
        @click="previousPage"
        :disabled="page <= 1"
        variant="ghost"
        size="sm"
        type="button"
        class="text-muted-foreground hover:text-primary disabled:opacity-50"
        >{{ i18n.t('downloadLibrary.previous') }}</Button
      >
      <Button
        @click="nextPage"
        :disabled="page >= pageCount"
        variant="ghost"
        size="sm"
        type="button"
        class="text-muted-foreground hover:text-primary disabled:opacity-50"
        >{{ i18n.t('downloadLibrary.next') }}</Button
      >
    </nav>
  </section>
</template>
