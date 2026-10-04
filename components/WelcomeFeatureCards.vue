<script lang="ts" setup>
import { FilesIcon, FolderDownIcon, LayersIcon, VideoIcon } from '@lucide/vue'

const FEATURES = [
  {
    title: '按需导出素材',
    icon: FilesIcon,
    description:
      '在「下载内容」中选择音频、封面、字幕或弹幕，只保存你需要的内容。',
    detail:
      '音频保存为 M4A；每个视频保留一份原始封面；字幕支持中文、英文或自动选择；弹幕导出为当前可获取的 XML。',
    note: '素材不可用时，会显示具体原因。',
  },
  {
    title: '单视频，一键下载',
    icon: VideoIcon,
    description:
      '打开 B 站普通视频页面，在播放器下方点击「下载视频」，即可开始保存。',
    detail: '也可以点击浏览器工具栏中的扩展图标，打开下载面板。',
    note: '默认选择当前账号可用的最高画质。',
  },
  {
    title: '多 P，自由切换',
    icon: LayersIcon,
    description:
      '默认下载当前分 P，也可以选择「全部分 P」或「自选分 P」，一次保存多个分段。',
    detail: '支持逐个勾选、全选或反选，按需要灵活组合。',
    note: '每个分 P 都会保存为独立的 MP4 文件。',
  },
  {
    title: '下载中心，查看进度',
    icon: FolderDownIcon,
    description:
      '下载会在新建的后台标签页中进行，可查看进度、搜索任务、筛选失败项和批量重试。',
    detail: '暂停队列后，当前任务继续完成，其余任务等待恢复。',
    note: '请保持下载中心打开；关闭或刷新会中断任务，可在下载中心重试。',
  },
]
</script>

<template>
  <ul class="grid gap-4 sm:grid-cols-2 sm:gap-5">
    <li
      v-for="feature in FEATURES"
      :key="feature.title"
      class="min-w-0"
    >
      <Card class="h-full gap-0 p-5 shadow-none sm:p-6">
        <div class="mb-4 flex items-center gap-3">
          <span
            class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"
          >
            <component
              :is="feature.icon"
              :stroke-width="1.75"
              class="size-[22px]"
              aria-hidden="true"
            />
          </span>
          <h2 class="text-base font-semibold tracking-tight sm:text-[17px]">
            {{ feature.title }}
          </h2>
        </div>
        <p class="text-sm leading-7">{{ feature.description }}</p>
        <p class="mt-2 pb-5 text-[13px] text-muted-foreground leading-6">
          {{ feature.detail }}
        </p>
        <p
          class="mt-auto border-t pt-3 text-xs text-muted-foreground leading-5"
        >
          {{ feature.note }}
        </p>
      </Card>
    </li>
  </ul>
</template>
