<script lang="ts" setup>
import { useDownloadCache } from '~/composables/useDownloadCache'
import { formatBytes } from '~/utils/downloads/model'

const {
  stats,
  isRefreshing,
  isClearing,
  error: cacheError,
  notice,
  refresh,
  clear,
} = useDownloadCache()
</script>

<template>
  <Card class="gap-4 py-5 shadow-none">
    <CardHeader class="px-5"
      ><CardTitle class="text-sm">下载缓存与大型任务</CardTitle></CardHeader
    >
    <CardContent class="px-5">
      <div
        class="mt-[16px] flex flex-wrap items-center justify-between gap-[12px]"
      >
        <p class="text-muted-foreground">
          <template v-if="stats">
            媒体缓存 {{ formatBytes(stats.bytes) }} · {{ stats.entries }} 条
          </template>
          <template v-else>
            {{ isRefreshing ? '正在读取下载缓存…' : '下载缓存暂不可用' }}
          </template>
        </p>
        <div class="flex items-center gap-[16px]">
          <Button
            @click="refresh"
            :disabled="isRefreshing || isClearing"
            variant="ghost"
            size="sm"
            type="button"
            class="text-muted-foreground hover:text-primary disabled:opacity-50"
          >
            刷新用量
          </Button>
          <Button
            @click="clear"
            :disabled="isClearing"
            variant="ghost"
            size="sm"
            type="button"
            class="text-muted-foreground hover:text-primary disabled:opacity-50"
          >
            {{ isClearing ? '正在清理…' : '清理下载缓存' }}
          </Button>
        </div>
      </div>
      <p class="mt-[10px] text-[12px] text-muted-foreground leading-[20px]">
        失败或刷新页面后，重试会尽量复用缓存并续传；续传需要媒体服务器支持。
        浏览器可能回收缓存。清理会移除续传数据，已保存文件与下载记录不受影响。
      </p>
      <Alert
        v-if="cacheError"
        class="mt-[10px] text-destructive"
        variant="destructive"
        ><AlertDescription>
          {{ cacheError }}
        </AlertDescription></Alert
      >
      <p
        v-if="notice"
        class="mt-[10px] text-primary"
        role="status"
      >
        {{ notice }}
      </p>
      <div class="mt-[16px] border-t border-border pt-[14px]">
        <h2 class="font-medium">大型任务：本地 FFmpeg</h2>
        <p class="mt-[8px] text-[12px] text-muted-foreground leading-[20px]">
          浏览器合并仍有单个分 P 输入 512 MB
          上限。对已失败、已取消或已完成的音视频任务，
          点击「导出本地任务」，再使用 Python 3 和 FFmpeg 在电脑上下载、合并。
        </p>
        <p class="mt-[8px] text-[12px] text-muted-foreground leading-[20px]">
          从
          <a
            href="https://github.com/ntnyq/bilibili-downloader"
            target="_blank"
            rel="noreferrer"
            class="text-primary underline outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >项目仓库</a
          >获取 scripts/native-downloader.py，在仓库目录运行下方命令，并将
          task.bili.json 替换为导出的任务文件路径。
        </p>
        <pre
          class="mt-[10px] whitespace-pre-wrap break-all rounded-[7px] bg-muted p-[10px] text-[11px] leading-[19px]"
        ><code>python3 scripts/native-downloader.py task.bili.json --output-dir ./downloads</code></pre>
        <p class="mt-[10px] text-[11px] text-muted-foreground leading-[19px]">
          任务文件含临时媒体地址，请勿分享；地址过期后需重新导出。
          本地下载不会修改浏览器队列状态，也不会同步进度。
        </p>
      </div>
    </CardContent>
  </Card>
</template>
