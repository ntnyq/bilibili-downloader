<script lang="ts" setup>
import { SearchIcon, XIcon } from '@lucide/vue'
import { formatDuration } from '~/utils/downloads/model'
import type { DownloadMode, VideoPage } from '~/types/download'

const props = defineProps<{
  pages: VideoPage[]
  currentPage: number
}>()
const mode = defineModel<DownloadMode>('mode', { required: true })
const selectedPages = defineModel<number[]>('selectedPages', { required: true })
const modes = [
  { value: 'current', label: '当前分 P' },
  { value: 'all', label: '全部分 P' },
  { value: 'selected', label: '自选分 P' },
] as const
const selected = computed(() => new Set(selectedPages.value))
const search = shallowRef('')
const isSelectedOnly = shallowRef(false)
const query = computed(() => search.value.trim().toLocaleLowerCase())
const visiblePages = computed(() =>
  props.pages.filter(
    page =>
      (!isSelectedOnly.value || selected.value.has(page.page))
      && (!query.value
        || `${page.part} P${page.page}`
          .toLocaleLowerCase()
          .includes(query.value)),
  ),
)
const isFiltered = computed(() => !!query.value || isSelectedOnly.value)
const targetPages = computed(() =>
  props.pages.filter(
    page =>
      mode.value === 'all'
      || (mode.value === 'current'
        ? page.page === props.currentPage
        : selected.value.has(page.page)),
  ),
)
const totalDuration = computed(() =>
  targetPages.value.reduce((sum, page) => sum + page.duration, 0),
)

function invertSelection() {
  const next = new Set(selected.value)
  for (const page of visiblePages.value) {
    if (next.has(page.page)) {
      next.delete(page.page)
    } else {
      next.add(page.page)
    }
  }
  selectedPages.value = [...next]
}
function selectVisible() {
  selectedPages.value = [
    ...new Set([
      ...selectedPages.value,
      ...visiblePages.value.map(page => page.page),
    ]),
  ]
}
function clearVisible() {
  const visible = new Set(visiblePages.value.map(page => page.page))
  selectedPages.value = selectedPages.value.filter(page => !visible.has(page))
}
function resetFilters() {
  search.value = ''
  isSelectedOnly.value = false
}
function togglePage(page: number, checked: boolean | 'indeterminate') {
  selectedPages.value =
    checked === true
      ? [...selectedPages.value.filter(item => item !== page), page]
      : selectedPages.value.filter(item => item !== page)
}
</script>

<template>
  <div class="mt-3 border-t pt-3">
    <div class="mb-2 flex justify-between text-xs">
      <span>下载范围</span
      ><span class="text-muted-foreground">共 {{ pages.length }} 个分 P</span>
    </div>
    <Tabs
      v-model="mode"
      class="gap-0"
    >
      <TabsList
        class="grid w-full grid-cols-3"
        aria-label="下载范围"
      >
        <TabsTrigger
          v-for="item in modes"
          :key="item.value"
          :value="item.value"
          >{{
            item.value === 'current' ? `当前 P${currentPage}` : item.label
          }}</TabsTrigger
        >
      </TabsList>
      <TabsContent :value="mode">
        <div
          v-if="mode === 'selected'"
          class="mt-3"
        >
          <div class="relative mb-2">
            <SearchIcon
              class="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              v-model="search"
              type="search"
              aria-label="搜索分 P 标题或序号"
              placeholder="搜索分 P 标题或序号"
              class="h-9 pl-9 text-xs"
            />
          </div>
          <div
            class="mb-2 flex flex-wrap items-center justify-between gap-1 text-[11px]"
          >
            <div class="flex items-center gap-1">
              <span class="text-primary"
                >已选 {{ targetPages.length }} / {{ pages.length }} P</span
              >
              <Button
                @click="isSelectedOnly = !isSelectedOnly"
                :aria-pressed="isSelectedOnly"
                :class="isSelectedOnly && 'bg-accent text-primary'"
                variant="ghost"
                size="xs"
                type="button"
                >仅看已选</Button
              >
            </div>
            <div class="flex gap-0.5">
              <Button
                @click="selectVisible"
                :disabled="!visiblePages.length"
                variant="ghost"
                size="xs"
                type="button"
                class="text-muted-foreground hover:text-primary"
              >
                {{ isFiltered ? '全选结果' : '全选' }}
              </Button>
              <Button
                @click="invertSelection"
                :disabled="!visiblePages.length"
                variant="ghost"
                size="xs"
                type="button"
                class="text-muted-foreground hover:text-primary"
              >
                {{ isFiltered ? '反选结果' : '反选' }}
              </Button>
              <Button
                @click="clearVisible"
                :disabled="!visiblePages.length"
                variant="ghost"
                size="xs"
                type="button"
                class="text-muted-foreground hover:text-primary"
              >
                {{ isFiltered ? '清空结果' : '清空' }}
              </Button>
            </div>
          </div>
          <ScrollArea
            v-if="visiblePages.length"
            :style="{
              height: `${Math.min(visiblePages.length * 48 + 8, 256)}px`,
            }"
            class="rounded-lg border"
            ><ul class="p-1">
              <li
                v-for="page in visiblePages"
                :key="page.cid"
              >
                <Label
                  :class="selected.has(page.page) && 'bg-accent'"
                  class="flex min-h-12 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-accent/70"
                >
                  <Checkbox
                    @update:model-value="togglePage(page.page, $event)"
                    :model-value="selected.has(page.page)"
                  />
                  <span class="shrink-0 text-[11px] text-muted-foreground"
                    >P{{ page.page }}</span
                  >
                  <span class="min-w-0 flex-1">
                    <span
                      :title="page.part"
                      class="block truncate"
                      >{{ page.part }}</span
                    >
                    <span
                      v-if="page.page === currentPage"
                      class="mt-0.5 block text-[10px] text-primary"
                      >正在播放</span
                    >
                  </span>
                  <span
                    class="shrink-0 text-[11px] text-muted-foreground tabular-nums"
                    >{{ formatDuration(page.duration) }}</span
                  >
                </Label>
              </li>
            </ul></ScrollArea
          >
          <div
            v-else
            class="rounded-lg border px-3 py-6 text-center text-xs text-muted-foreground"
            role="status"
          >
            <p>
              {{
                isSelectedOnly && !targetPages.length
                  ? '还没有选择分 P'
                  : '没有匹配的分 P'
              }}
            </p>
            <Button
              @click="resetFilters"
              variant="ghost"
              size="sm"
              type="button"
              class="mt-2 text-primary"
              >显示全部分 P</Button
            >
          </div>
        </div>
        <p
          v-if="mode === 'current'"
          class="mt-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-foreground"
        >
          <span
            class="shrink-0 rounded border bg-background px-1 text-[10px] text-muted-foreground"
            >P{{ currentPage }}</span
          >
          <span
            :title="targetPages[0]?.part"
            class="min-w-0 flex-1 truncate"
            >{{ targetPages[0]?.part }}</span
          >
          <span class="shrink-0 text-[11px] text-muted-foreground">{{
            formatDuration(totalDuration)
          }}</span>
        </p>
        <div
          v-if="mode !== 'current'"
          class="mt-3 rounded-lg bg-muted p-3 text-xs"
        >
          <p aria-live="polite">
            {{
              targetPages.length
                ? `将下载 ${targetPages.length} 个分 P · 总时长 ${formatDuration(totalDuration)}`
                : '请至少选择一个分 P'
            }}
          </p>
          <div
            v-if="mode === 'selected' && targetPages.length"
            class="mt-2 flex flex-wrap gap-1"
          >
            <Button
              @click="togglePage(page.page, false)"
              v-for="page in targetPages.slice(0, 6)"
              :key="page.cid"
              :aria-label="`取消选择 P${page.page} ${page.part}`"
              variant="outline"
              size="xs"
              type="button"
              class="h-6 text-[11px]"
              >P{{ page.page
              }}<XIcon
                class="size-3"
                aria-hidden="true"
            /></Button>
            <span
              v-if="targetPages.length > 6"
              class="self-center text-[11px] text-muted-foreground"
              >另 {{ targetPages.length - 6 }} P</span
            >
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
