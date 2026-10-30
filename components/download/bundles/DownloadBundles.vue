<script lang="ts" setup>
import { useDownloadBundle } from '~/composables/useDownloadBundle'
import { useDownloadQueue } from '~/composables/useDownloadQueue'
import { i18n } from '~/utils/i18n'

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
  <section :aria-label="i18n.t('downloadWorkspace.assetBundles')">
    <h2 class="text-[14px] font-semibold">
      {{ i18n.t('downloadWorkspace.assetBundles') }}
    </h2>
    <p class="mt-1.25 text-[12px] text-muted-foreground leading-5">
      {{ i18n.t('downloadBundles.reviewBundleResultsByVideoABundleIs') }}
    </p>
    <Alert
      v-if="queueError"
      class="mt-2.5 text-[12px] text-destructive"
      variant="destructive"
      ><AlertDescription>
        {{ queueError }}
      </AlertDescription></Alert
    >
    <p
      v-if="!bundles.length"
      class="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground"
    >
      {{ i18n.t('downloadBundles.noBundlesYetChooseAssetBundlesOnA') }}
    </p>
    <div class="mt-3 space-y-3">
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
