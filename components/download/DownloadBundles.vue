<script lang="ts" setup>
import { useDownloadBundle } from '~/composables/useDownloadBundle'
import { useDownloadQueue } from '~/composables/useDownloadQueue'

const {
  jobs,
  error: queueError,
  cancel,
  retry,
  pause,
  resume,
} = useDownloadQueue()
const { bundles } = useDownloadBundle(jobs)
</script>

<template>
  <section aria-label="素材组合">
    <h2 class="text-[14px] font-semibold">素材组合</h2>
    <p class="mt-[5px] text-[12px] text-muted-foreground leading-[20px]">
      按视频查看本次组合的整体结果。仅全部素材保存成功时显示完成，失败和取消可单独重试。
    </p>
    <Alert
      v-if="queueError"
      class="mt-[10px] text-[12px] text-destructive"
      variant="destructive"
      ><AlertDescription>
        {{ queueError }}
      </AlertDescription></Alert
    >
    <p
      v-if="!bundles.length"
      class="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground"
    >
      还没有素材组合。在视频页切换到「素材组合」，选择需要的素材后下载。
    </p>
    <div class="mt-[12px] space-y-[12px]">
      <DownloadBundleProgress
        @cancel="cancel"
        @retry="retry"
        @pause="pause"
        @resume="resume"
        v-for="bundle in bundles"
        :key="bundle.id"
        :bundle
      />
    </div>
  </section>
</template>
