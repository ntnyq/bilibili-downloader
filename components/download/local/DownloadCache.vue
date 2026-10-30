<script lang="ts" setup>
import { useDownloadCache } from '~/composables/useDownloadCache'
import { formatBytes } from '~/utils/downloads/format'

const {
  stats,
  availableBytes,
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
      ><CardTitle class="text-sm">浏览器下载缓存</CardTitle></CardHeader
    >
    <CardContent class="px-5">
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-muted-foreground">
          <template v-if="stats">
            媒体缓存 {{ formatBytes(stats.bytes) }} · {{ stats.entries }} 条
          </template>
          <template v-else>
            {{ isRefreshing ? '正在读取下载缓存…' : '下载缓存暂不可用' }}
          </template>
        </p>
        <div class="flex items-center gap-4">
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
      <p class="mt-2.5 text-[12px] text-muted-foreground leading-5">
        <template v-if="availableBytes !== null">
          浏览器剩余配额约 {{ formatBytes(availableBytes) }}。
        </template>
        音视频下载不设固定输入大小上限，会按剩余配额为输入、封装输出和安全余量预留空间，最终下载文件还需额外磁盘空间。
      </p>
      <p class="mt-2.5 text-[12px] text-muted-foreground leading-5">
        失败或刷新页面后，重试会尽量复用缓存并续传；续传需要媒体服务器支持。
        浏览器可能回收缓存。清理会移除续传数据，已保存文件与下载记录不受影响。
      </p>
      <Alert
        v-if="cacheError"
        class="mt-2.5 text-destructive"
        variant="destructive"
        ><AlertDescription>
          {{ cacheError }}
        </AlertDescription></Alert
      >
      <p
        v-if="notice"
        class="mt-2.5 text-primary"
        role="status"
      >
        {{ notice }}
      </p>
    </CardContent>
  </Card>
</template>
