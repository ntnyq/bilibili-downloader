import {
  DEFAULT_FILENAME_TEMPLATE,
  filenameTemplateSchema,
} from '~/types/download'
import { createFilename } from '~/utils/downloads/filename'
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
    return createFilename({
      bvid: 'BV1xx411c7mD',
      title: '周末去海边',
      owner: '示例 UP',
      kind: 'video',
      pageCount: 2,
      page: 1,
      part: '沿着海岸走',
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
        validation.value.error.issues[0]?.message || '命名模板无效。'
      return
    }
    if (
      await updateSettings({
        filenameTemplate: validation.value.data,
        folderMode: folderMode.value,
      })
    ) {
      notice.value = '文件设置已保存，将用于新加入的任务。'
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
