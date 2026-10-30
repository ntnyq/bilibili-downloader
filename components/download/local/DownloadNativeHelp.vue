<script lang="ts" setup>
import { ChevronDownIcon } from '@lucide/vue'

const isExpanded = shallowRef(false)
</script>

<template>
  <Card class="gap-0 rounded-lg p-5 text-sm shadow-none">
    <Collapsible v-model:open="isExpanded">
      <h2>
        <CollapsibleTrigger as-child>
          <Button
            variant="ghost"
            type="button"
            class="h-auto w-full justify-between whitespace-normal p-0 text-left hover:bg-transparent"
          >
            高级选项：本地助手
            <ChevronDownIcon
              :class="isExpanded && 'rotate-180'"
              class="size-4 shrink-0"
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent class="mt-4 space-y-5 text-xs leading-6">
        <p class="text-muted-foreground">
          浏览器下载无需安装 Python 或 FFmpeg，大文件按浏览器剩余配额检查空间。
          如需在浏览器配额之外保存文件，或使用本机 FFmpeg，可选用本地助手。
          本地助手与浏览器缓存独立，交接时不会搬运已有缓存。
        </p>
        <section>
          <h3 class="font-medium">从扩展交接任务</h3>
          <p class="mt-2 text-muted-foreground">
            安装并注册助手后，在已暂停、失败、取消或完成的音视频任务中，
            打开「查看详情」→「高级选项：本地助手」，点击「交给本地助手」。
            下载中心会显示本地处理状态和保存路径；处理期间请保持下载中心打开。
          </p>
          <Button
            as="a"
            href="https://github.com/ntnyq/bilibili-downloader/blob/main/docs/zh/advanced/native-bridge.md"
            target="_blank"
            rel="noreferrer"
            variant="outline"
            class="mt-3"
            size="sm"
            >查看安装说明</Button
          >
        </section>
        <section>
          <h3 class="font-medium">独立命令行下载</h3>
          <p class="mt-2 text-muted-foreground">
            在已失败、取消或完成的音视频任务详情中展开高级选项，点击「导出本地任务」。
            安装 Python 3.10+ 和 FFmpeg 后，从
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
            class="mt-2.5 whitespace-pre-wrap break-all rounded-lg bg-muted p-2.5 text-[11px] leading-5"
          ><code>python3 scripts/native-downloader.py task.bili.json --output-dir ./downloads</code></pre>
          <p class="mt-2 text-muted-foreground">
            命令行任务独立运行，不会同步浏览器队列状态或进度。
            任务文件含临时媒体地址，请勿分享；地址过期后需重新导出。
          </p>
        </section>
      </CollapsibleContent>
    </Collapsible>
  </Card>
</template>
