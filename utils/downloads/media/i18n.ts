import { i18n } from '~/utils/i18n'

const REMUX_MESSAGE_KEYS = [
  'ffmpegDiskFile.browserDiskWriteIncomplete',
  'fragmentSamples.sampleStorageIsClosed',
  'fragmentSamples.sampleStorageFileReadOrWriteIncomplete',
  'fragmentSamples.invalidSampleTrackId',
  'fragmentSamples.invalidSampleStorageReference',
  'fragmentSamples.invalidSampleStorageField',
  'fragmentSamples.invalidSampleStorageType',
  'fragmentSamples.invalidSampleStorageSize',
  'fragmentSamples.invalidGopStorageRange',
  'fragmentSamples.invalidSortedTimestampReference',
  'fragmentSamples.invalidSampleMediaReadRange',
  'fragmentSamples.invalidSampleReleaseRange',
  'fragmentSamples.thisBrowserDoesNotSupportWorkerSampleDisk',
  'fragmentStore.fragmentStorageIsClosed',
  'fragmentStore.invalidFragmentTrackId',
  'fragmentStore.fragmentStorageFileWriteMadeNoProgress',
  'fragmentStore.fragmentStorageHasEnteredTheReadPhase',
  'fragmentStore.fragmentStorageFileIsTooLarge',
  'fragmentStore.invalidFragmentStorageReadRange',
  'fragmentStore.fragmentStorageFileIsIncomplete',
  'fragmentStore.fragmentStorageFileReadIncomplete',
  'fragmentStore.fragmentStorageWriteStreamIsClosed',
  'fragmentStore.fragmentStorageHasNotBeenCommitted',
  'progressiveMedia.cannotLoadBrowserFfmpeg',
  'progressiveMedia.theBrowserFfmpegFileInterfaceIsIncompatibleUpdate',
  'progressiveMedia.invalidNumberOfMediaAssets',
  'progressiveMedia.thisBrowserLacksTheSynchronousFileInterfaceNeeded',
  'remuxWorker.browserMediaRemuxingFailed',
  'remuxMedia.cannotReadTheMp4VideoTrack',
  'remuxMedia.cannotReadTheAacTrackInTheMp4',
  'remuxMedia.theAssetTrackHasNoPacketsToRemux',
] as const

/**
 * Dedicated workers receive only their own messages, resolved by the browser.
 */
export function getRemuxMessages(): Record<string, string> {
  return {
    ...Object.fromEntries(REMUX_MESSAGE_KEYS.map(key => [key, i18n.t(key)])),
    'progressiveMedia.legacyVideoRemuxingFailedCheckThatTheAssets': i18n.t(
      'progressiveMedia.legacyVideoRemuxingFailedCheckThatTheAssets',
      ['$1'],
    ),
  }
}
