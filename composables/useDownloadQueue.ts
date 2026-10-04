import { z } from 'zod'
import { browser } from '#imports'
import { downloadJobsSchema } from '~/types/download'
import { sendDownloadMessage } from '~/utils/downloads/messages'
import {
  errorMessage,
  isJobActive,
  JOBS_STORAGE_KEY,
} from '~/utils/downloads/model'
import type { Browser } from '#imports'
import type { DownloadJob } from '~/types/download'
import type { requestSchema } from '~/utils/downloads/messages'

export function useDownloadQueue() {
  const jobs = shallowRef<DownloadJob[]>([])
  const error = shallowRef('')
  const activeJobs = computed(() => jobs.value.filter(isJobActive))
  const completedJobs = computed(() =>
    jobs.value.filter(job => job.status === 'completed'),
  )
  let revision = 0
  let disposed = false
  const onChanged = (
    changes: Record<string, Browser.storage.StorageChange>,
    area: string,
  ) => {
    const change = changes[JOBS_STORAGE_KEY]
    if (area !== 'local' || !change) {
      return
    }
    const result = downloadJobsSchema.safeParse(change.newValue || [])
    if (result.success) {
      revision++
      jobs.value = result.data
    }
  }
  browser.storage.onChanged.addListener(onChanged)
  const initialRevision = revision
  sendDownloadMessage({ type: 'queue.list' }, downloadJobsSchema)
    .then(value => {
      if (!disposed && initialRevision === revision) {
        jobs.value = value
      }
    })
    .catch(error_ => {
      error.value = errorMessage(error_)
    })
  onScopeDispose(() => {
    disposed = true
    browser.storage.onChanged.removeListener(onChanged)
  })

  async function act(message: z.infer<typeof requestSchema>) {
    error.value = ''
    try {
      await sendDownloadMessage(message, z.null())
    } catch (error_) {
      error.value = errorMessage(error_)
    }
  }

  return {
    jobs,
    error,
    activeJobs,
    completedJobs,
    cancel: (id?: string) => act({ type: 'queue.cancel', id }),
    pause: (id: string) => act({ type: 'queue.pause', id }),
    resume: (id: string) => act({ type: 'queue.resume', id }),
    move(id: string, direction: 'up' | 'down') {
      return act({ type: 'queue.move', id, direction })
    },
    retry: (id: string) => act({ type: 'queue.retry', id }),
    retryFailed: () => act({ type: 'queue.retryFailed' }),
    clear: () => act({ type: 'queue.clear' }),
    openManager: () => act({ type: 'runner.open' }),
  }
}
