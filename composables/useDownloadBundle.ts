import { summarizeDownloadBundles } from '~/utils/downloads/bundles'
import type { MaybeRefOrGetter } from 'vue'
import type { DownloadJob } from '~/types/download'

export function useDownloadBundle(jobs: MaybeRefOrGetter<DownloadJob[]>) {
  const bundles = computed(() => summarizeDownloadBundles(toValue(jobs)))
  return {
    bundles,
  }
}
