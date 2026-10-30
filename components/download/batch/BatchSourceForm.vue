<script lang="ts" setup>
import { ListVideoIcon, LoaderCircleIcon } from '@lucide/vue'
import { MAX_BATCH_ITEMS } from '~/types/batch'
import { MAX_BATCH_DRAFT_LENGTH } from '~/types/batchSession'
import type { BatchSourceKind } from '~/types/batchSession'

defineProps<{
  disabled: boolean
  loading: boolean
}>()
const emit = defineEmits<{
  preview: []
  stop: []
}>()
const sourceKind = defineModel<BatchSourceKind>('sourceKind', {
  required: true,
})
const input = defineModel<string>('input', { required: true })

const sources: {
  kind: BatchSourceKind
  label: string
  hint: string
  placeholder: string
}[] = [
  {
    kind: 'links',
    label: '链接列表',
    hint: `每行一个视频链接、BV 号或 av 号，最多 ${MAX_BATCH_ITEMS} 行。请使用完整视频链接，不支持短链接。`,
    placeholder:
      'https://www.bilibili.com/video/BV1xx411c7mD/?p=2\nBV1xx411c7mD',
  },
  {
    kind: 'favorites',
    label: '收藏夹',
    hint: '粘贴收藏夹链接或收藏夹 ID。私有收藏夹需要先登录对应的 B 站账号。',
    placeholder: 'https://space.bilibili.com/123/favlist?fid=456',
  },
  {
    kind: 'collection',
    label: '合集 / 系列',
    hint: '从 UP 空间打开合集或系列，复制完整列表链接（包含 UP 的 UID）。',
    placeholder: 'https://space.bilibili.com/123/lists/456?type=season',
  },
  {
    kind: 'uploads',
    label: 'UP 投稿',
    hint: '粘贴 UP 空间链接或 UID。只读取公开的视频投稿。',
    placeholder: 'https://space.bilibili.com/123/upload/video',
  },
]
const activeSource = computed(
  () => sources.find(item => item.kind === sourceKind.value) || sources[0],
)
</script>

<template>
  <form @submit.prevent="emit('preview')">
    <fieldset :disabled="disabled || loading">
      <legend class="sr-only">批量导入来源</legend>
      <Tabs v-model="sourceKind">
        <TabsList
          class="mt-4 grid h-auto w-full grid-cols-2 sm:grid-cols-4"
          aria-label="批量导入来源"
        >
          <TabsTrigger
            v-for="source in sources"
            :key="source.kind"
            :value="source.kind"
            :disabled="disabled || loading"
            >{{ source.label }}</TabsTrigger
          >
        </TabsList>
        <TabsContent :value="sourceKind">
          <Label class="mt-4 block text-[12px] font-medium">
            {{ activeSource?.label }}
            <Textarea
              v-model="input"
              v-if="sourceKind === 'links'"
              :placeholder="activeSource?.placeholder"
              :maxlength="MAX_BATCH_DRAFT_LENGTH"
              rows="4"
              spellcheck="false"
              aria-describedby="batch-source-hint"
              class="mt-2 min-h-27 w-full resize-y border border-border rounded-[9px] bg-white px-3 py-2.5 text-[13px] font-normal leading-5.25 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
              required
            />
            <Input
              v-model="input"
              v-else
              :placeholder="activeSource?.placeholder"
              :maxlength="8000"
              type="text"
              spellcheck="false"
              aria-describedby="batch-source-hint"
              class="mt-2 w-full border border-border rounded-[9px] bg-white px-3 py-2.5 text-[13px] font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-55"
              required
            />
          </Label>
          <p
            id="batch-source-hint"
            class="mt-2 text-[11px] text-muted-foreground leading-4.5"
          >
            {{ activeSource?.hint }}
          </p>
          <Button
            :disabled="disabled || loading || !input.trim()"
            type="submit"
            class="mt-3.5"
          >
            <component
              :is="loading ? LoaderCircleIcon : ListVideoIcon"
              :class="{ 'animate-spin motion-reduce:animate-none': loading }"
              aria-hidden="true"
              class="size-4 shrink-0"
            />
            {{ loading ? '正在读取…' : '预览列表' }}
          </Button>
        </TabsContent>
      </Tabs>
    </fieldset>
    <Button
      @click="emit('stop')"
      v-if="loading"
      variant="ghost"
      size="sm"
      type="button"
      class="mt-2.5 text-muted-foreground hover:text-primary text-[12px]"
    >
      停止读取
    </Button>
  </form>
</template>
