import {
  DEFAULT_FILENAME_TEMPLATE,
  filenameTemplateSchema,
} from '~/types/download'
import { createDownloadPath } from '~/utils/downloads/files/createDownloadPath'
import { i18n } from '~/utils/i18n'
import { useDownloadSettings } from './useDownloadSettings'

export function useDownloadFileSettings() {
  const preferences = useDownloadSettings()
  const { settings, updateSettings } = preferences
  const filenameTemplate = shallowRef(settings.value.filenameTemplate)
  const folderMode = shallowRef(settings.value.folderMode)
  const notice = shallowRef('')
  const error = shallowRef('')

  watch(
    [() => settings.value.filenameTemplate, () => settings.value.folderMode],
    ([template, folder]) => {
      filenameTemplate.value = template
      folderMode.value = folder
    },
  )
  const validation = computed(() =>
    filenameTemplateSchema.safeParse(filenameTemplate.value),
  )
  const preview = computed(() => {
    if (!validation.value.success) {
      return ''
    }
    return createDownloadPath({
      bvid: 'BV1xx411c7mD',
      title: i18n.t('useDownloadFileSettings.weekendAtTheBeach'),
      owner: i18n.t('useDownloadFileSettings.exampleUploader'),
      kind: 'video',
      pageCount: 2,
      page: 1,
      part: i18n.t('useDownloadFileSettings.walkingAlongTheCoast'),
      quality: '1080P',
      filenameTemplate: validation.value.data,
      folderMode: folderMode.value,
    })
  })
  async function save() {
    error.value = ''
    notice.value = ''
    if (!validation.value.success) {
      error.value =
        validation.value.error.issues[0]?.message
        || i18n.t('useDownloadFileSettings.invalidFilenameTemplate')
      return
    }
    if (
      await updateSettings({
        filenameTemplate: validation.value.data,
        folderMode: folderMode.value,
      })
    ) {
      notice.value = i18n.t(
        'useDownloadFileSettings.fileSettingsSavedTheyWillApplyToNewly',
      )
    }
  }
  function resetDefaults() {
    filenameTemplate.value = DEFAULT_FILENAME_TEMPLATE
    folderMode.value = 'flat'
    notice.value = ''
  }
  return {
    ...preferences,
    filenameTemplate,
    folderMode,
    preview,
    validation,
    notice,
    formError: error,
    save,
    resetDefaults,
  }
}
