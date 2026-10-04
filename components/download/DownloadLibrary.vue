<script lang="ts" setup>
import { DownloadIcon, EllipsisIcon, HistoryIcon, InfoIcon } from '@lucide/vue'
import { useDownloadHistory } from '~/composables/useDownloadHistory'
import { useDownloadLibrary } from '~/composables/useDownloadLibrary'
import { MAX_LIBRARY_RECORDS } from '~/types/downloadHistory'
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
              ><DownloadIcon class="size-4" />导出记录</Button
            ></DropdownMenuTrigger
          >
          <DropdownMenuContent align="end">
            <DropdownMenuLabel
              >导出当前筛选的
              {{ filteredRecords.length }} 条记录</DropdownMenuLabel
            >
            <DropdownMenuItem @select="downloadHistory(filteredRecords, 'json')"
              >导出 JSON</DropdownMenuItem
            >
            <DropdownMenuItem @select="downloadHistory(filteredRecords, 'csv')"
              >导出 CSV</DropdownMenuItem
            >
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger as-child
            ><Button
              variant="outline"
              size="icon"
              aria-label="更多历史记录操作"
              ><EllipsisIcon class="size-4" /></Button
          ></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              @select="refresh"
              :disabled="isRefreshing || isBusy"
              >{{ isRefreshing ? '正在刷新…' : '刷新记录' }}</DropdownMenuItem
            >
            <DropdownMenuSeparator />
            <DropdownMenuItem
              @select="isClearPending = true"
              :disabled="isBusy || (!records.length && !libraryError)"
              class="text-destructive"
              >清空下载历史</DropdownMenuItem
            >
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </DownloadLibraryFilters>
    <h2
      id="download-library-title"
      class="sr-only"
    >
      下载历史
    </h2>
    <p
      v-if="evictedCount"
      class="mb-4 text-xs text-muted-foreground"
    >
      已因存储上限移除
      {{ evictedCount }} 条旧记录；这些素材可能再次加入批量下载。
    </p>
    <AlertDialog v-model:open="isClearPending">
      <AlertDialogContent>
        <AlertDialogHeader
          ><AlertDialogTitle>清空下载历史？</AlertDialogTitle
          ><AlertDialogDescription
            >清空{{
              isReady ? `全部 ${records.length} 条记录` : '无法读取的下载历史'
            }}后，批量导入将不再依据这些记录跳过素材。已保存文件不受影响。</AlertDialogDescription
          ></AlertDialogHeader
        >
        <AlertDialogFooter
          ><AlertDialogCancel>保留记录</AlertDialogCancel
          ><AlertDialogAction
            @click="clearHistory"
            :disabled="isBusy"
            >确认清空</AlertDialogAction
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
        {{
          isReady
            ? records.length
              ? '没有匹配的下载记录'
              : '这里会记住每一份收藏'
            : isRefreshing
              ? '正在读取下载历史…'
              : '下载历史暂不可用'
        }}
      </p>
      <p class="mt-2 text-xs text-muted-foreground">
        {{
          isReady
            ? records.length
              ? '试试其他关键词，或查看全部素材。'
              : '成功下载的素材会自动保存在这里。'
            : '请稍后重试。'
        }}
      </p>
      <Button
        @click="resetFilters"
        v-if="isReady && records.length"
        variant="outline"
        size="sm"
        class="mt-4"
        >清除筛选</Button
      >
      <Button
        @click="refresh"
        v-if="!isReady && !isRefreshing"
        variant="outline"
        size="sm"
        class="mt-4"
        >重新读取</Button
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
          这里保存下载记录；移除记录不会删除电脑上的文件。
        </p>
        <CollapsibleTrigger as-child
          ><Button
            variant="ghost"
            size="xs"
            >了解更多</Button
          ></CollapsibleTrigger
        >
      </div>
      <CollapsibleContent class="mt-3 space-y-2 leading-6">
        <p>
          独立保留每份素材最近一次成功下载，最多 {{ MAX_LIBRARY_RECORDS }} 条或
          3 MB，达到上限时移除最旧记录。清除下载队列记录不会影响这里。
        </p>
        <p>
          删除记录会让批量导入不再跳过对应素材。再次下载沿用原任务的画质、命名与目录设置，实际可用素材可能变化。
        </p>
      </CollapsibleContent>
    </Collapsible>
    <nav
      v-if="filteredRecords.length"
      aria-label="下载历史分页"
      class="mt-5 flex flex-wrap items-center justify-end gap-3 text-xs"
    >
      <span class="mr-auto text-muted-foreground"
        >筛选结果 {{ filteredRecords.length }} 条</span
      >
      <span class="text-muted-foreground"
        >第 {{ page }} / {{ pageCount }} 页 · 每页 20 条</span
      >
      <Button
        @click="previousPage"
        :disabled="page <= 1"
        variant="ghost"
        size="sm"
        type="button"
        class="text-muted-foreground hover:text-primary disabled:opacity-50"
      >
        上一页
      </Button>
      <Button
        @click="nextPage"
        :disabled="page >= pageCount"
        variant="ghost"
        size="sm"
        type="button"
        class="text-muted-foreground hover:text-primary disabled:opacity-50"
      >
        下一页
      </Button>
    </nav>
  </section>
</template>
