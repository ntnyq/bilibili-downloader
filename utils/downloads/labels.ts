import { i18n } from '~/utils/i18n'
import type {
  DownloadJob,
  DownloadKind,
  FolderMode,
  JobStatus,
  QualityPreference,
  SubtitleLanguage,
} from '~/types/download'

export const DOWNLOAD_KIND_LABELS: Record<DownloadKind, string> = {
  get video() {
    return i18n.t('labels.videoMp4')
  },
  get audio() {
    return i18n.t('labels.audioM4a')
  },
  get cover() {
    return i18n.t('downloadQueueItem.videoCover')
  },
  get subtitle() {
    return i18n.t('labels.subtitlesSrt')
  },
  get danmaku() {
    return i18n.t('labels.danmakuXml')
  },
}

export const SUBTITLE_LANGUAGE_LABELS: Record<SubtitleLanguage, string> = {
  get auto() {
    return i18n.t('labels.automaticPreferChinese')
  },
  get zh() {
    return i18n.t('labels.chinese')
  },
  get en() {
    return i18n.t('labels.english')
  },
}

export const DOWNLOAD_KIND_HINTS: Record<DownloadKind, string> = {
  get video() {
    return i18n.t('labels.mergeVideoAndAudioAutomaticallyActualQualityDepends')
  },
  get audio() {
    return i18n.t('labels.downloadOnlyTheHighestBitrateAacTrackAnd')
  },
  get cover() {
    return i18n.t('labels.saveOneOriginalCoverPerVideoWithoutDuplicating')
  },
  get subtitle() {
    return i18n.t('labels.saveSubtitlesForEachPartPreferringHumanSubtitles')
  },
  get danmaku() {
    return i18n.t('labels.saveTheCurrentlyAvailableDanmakuXmlItDoes')
  },
}

export const STATUS_LABELS: Record<JobStatus, string> = {
  get queued() {
    return i18n.t('labels.waiting')
  },
  get paused() {
    return i18n.t('downloadQueue.paused')
  },
  get native() {
    return i18n.t('labels.localHelperDownload')
  },
  get resolving() {
    return i18n.t('labels.resolvingAvailableQuality')
  },
  get downloading() {
    return i18n.t('labels.downloadingVideoAndAudio')
  },
  get merging() {
    return i18n.t('labels.mergingMp4')
  },
  get saving() {
    return i18n.t('labels.savingFile')
  },
  get completed() {
    return i18n.t('labels.saved')
  },
  get failed() {
    return i18n.t('labels.downloadFailed')
  },
  get cancelled() {
    return i18n.t('labels.cancelled')
  },
}

export const FOLDER_MODE_LABELS: Record<FolderMode, string> = {
  get flat() {
    return i18n.t('labels.directlyInBilibili')
  },
  get owner() {
    return i18n.t('labels.groupByUploader')
  },
  get video() {
    return i18n.t('labels.groupByVideo')
  },
  get 'owner-video'() {
    return i18n.t('labels.groupByUploaderVideo')
  },
}

export const QUALITY_LABELS: Record<QualityPreference, string> = {
  get best() {
    return i18n.t('labels.bestAvailableQuality')
  },
  get '1080'() {
    return i18n.t('labels.upTo1080p')
  },
  get '720'() {
    return i18n.t('labels.upTo720p')
  },
  get '480'() {
    return i18n.t('labels.upTo480p')
  },
}

/**
 * Resolves asset-specific wording for active download phases.
 *
 * @param job - Job whose kind specializes resolving, downloading, or merging
 * wording.
 * @returns A phase-specific display label, or undefined so the caller can fall
 * back to STATUS_LABELS.
 */
export function getJobStatusLabel(job: DownloadJob): string | undefined {
  if (job.status === 'resolving') {
    return job.kind === 'video'
      ? i18n.t('labels.resolvingAvailableQuality')
      : i18n.t('labels.loadingAssetInformation')
  }
  if (job.status === 'downloading') {
    return job.kind === 'video'
      ? i18n.t('labels.downloadingVideoAndAudio')
      : i18n.t('labels.downloading', [DOWNLOAD_KIND_LABELS[job.kind]])
  }
  if (job.status === 'merging') {
    return job.kind === 'audio'
      ? i18n.t('labels.remuxingM4a')
      : i18n.t('labels.mergingMp4')
  }
}
