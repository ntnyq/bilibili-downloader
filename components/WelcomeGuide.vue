<script lang="ts" setup>
import { FolderDownIcon, InfoIcon } from '@lucide/vue'
import { useDownloadQueue } from '~/composables/useDownloadQueue'

const { openManager, error: queueError } = useDownloadQueue()
</script>

<template>
  <div class="bili-font min-h-screen bg-muted">
    <ExtensionHeader />
    <main class="mx-auto max-w-[960px] px-4 py-8 sm:px-8 sm:py-12">
      <div class="mb-8 flex items-start gap-4 sm:mb-10">
        <ExtensionLogo class="size-12 sm:size-14" />
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold tracking-tight sm:text-[28px]">
            开始保存喜欢的内容
          </h1>
          <p class="mt-2 text-sm text-muted-foreground leading-6">
            在视频页面，把喜欢的内容保存为 MP4、M4A 或独立素材。
          </p>
        </div>
      </div>

      <WelcomeFeatureCards />

      <div
        class="mt-6 rounded-xl border bg-background p-5 text-[13px] text-muted-foreground leading-6 sm:p-6"
      >
        <h2
          class="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <InfoIcon
            class="size-4 text-primary"
            aria-hidden="true"
          />
          下载前，了解这些
        </h2>
        <p>
          默认选择最高可用画质，也可设置最高 1080P / 720P /
          480P。偏好自动保存，已入队任务保留原设置。同分辨率和帧率下优先
          SDR，同画质优先兼容性较好的编码。实际画质显示在任务进度中。
        </p>
        <p class="mt-[10px]">
          每个分 P 的音视频输入总计最多 512
          MB。暂不支持直播、番剧、互动视频或受保护的视频。
        </p>
        <p class="mt-[10px]">
          文件保存在浏览器下载目录的 Bilibili
          文件夹。更改保存位置请使用浏览器的下载设置。
        </p>
      </div>

      <Button
        @click="openManager"
        class="mt-[28px]"
        type="button"
      >
        <FolderDownIcon
          class="size-4 shrink-0"
          aria-hidden="true"
        />打开下载中心
      </Button>
      <p
        v-if="queueError"
        class="mt-[12px] text-destructive"
        role="alert"
      >
        {{ queueError }}
      </p>
    </main>
  </div>
</template>
