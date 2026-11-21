<script lang="ts" setup>
import { DownloadIcon, FilmIcon } from '@lucide/vue'
import { useDownloadSettings } from '~/composables/useDownloadSettings'
import { useSeasonDownload } from '~/composables/useSeasonDownload'
import { i18n } from '~/utils/i18n'
import type { SeasonTarget } from '~/types/season'

const props = defineProps<{
  target: SeasonTarget
  activeEpisodeIds: ReadonlySet<number>
}>()

const {
  settings,
  isReady,
  isSaving,
  error: settingsError,
  updateSettings,
} = useDownloadSettings()
const {
  season,
  page,
  pageCount,
  rows,
  selected,
  selectedEpisodeIds,
  isLoading,
  isAdding,
  canRecheck,
  error: seasonError,
  notice,
  load,
  checkVisibleEpisodes,
  addSelected,
} = useSeasonDownload(props.target, () => props.activeEpisodeIds)

const isQualityDisabled = computed(
  () => !isReady.value || isSaving.value || isAdding.value,
)
const isSubmitDisabled = computed(
  () => !selectedEpisodeIds.value.length || isQualityDisabled.value,
)
</script>

<template>
  <p
    v-if="isLoading"
    class="py-4.5 text-[13px] text-muted-foreground"
    role="status"
  >
    {{ i18n.t('season.loading') }}
  </p>
  <template v-else-if="season">
    <div class="flex items-center gap-3">
      <div
        class="flex h-18 w-13.5 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent"
      >
        <img
          v-if="season.cover"
          :src="season.cover"
          alt=""
          referrerpolicy="no-referrer"
          class="h-full w-full object-cover"
        />
        <FilmIcon
          v-else
          class="size-6 text-primary"
          aria-hidden="true"
        />
      </div>
      <div class="min-w-0">
        <h2 class="line-clamp-2 text-[14px] font-semibold">
          {{ season.title }}
        </h2>
        <p class="mt-1 text-xs text-muted-foreground">MP4</p>
      </div>
    </div>
    <template v-if="rows.length">
      <DownloadQuality
        @update:model-value="updateSettings({ quality: $event })"
        :model-value="settings.quality"
        :disabled="isQualityDisabled"
      />
      <fieldset class="mt-3 min-w-0">
        <legend class="text-[13px] font-medium">
          {{ i18n.t('season.episodes') }}
        </legend>
        <ul class="mt-1 max-h-58 divide-y overflow-y-auto rounded-lg border">
          <li
            v-for="row in rows"
            :key="row.epId"
          >
            <label
              :class="row.isSelectable && 'cursor-pointer hover:bg-muted/60'"
              class="flex items-start gap-2.5 px-3 py-2 text-xs"
            >
              <input
                v-model="selected"
                :value="row.epId"
                :disabled="!row.isSelectable || isAdding"
                type="checkbox"
                class="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span class="min-w-0 break-words">
                <span class="font-medium">{{ row.label }}</span>
                <span class="mt-0.5 block text-muted-foreground">
                  {{ row.status }}
                </span>
              </span>
            </label>
          </li>
        </ul>
      </fieldset>
      <div
        v-if="pageCount > 1 || canRecheck"
        class="mt-2 flex flex-wrap items-center gap-1.5"
      >
        <template v-if="pageCount > 1">
          <Button
            @click="page--"
            :disabled="isAdding || page <= 1"
            size="sm"
            variant="outline"
            type="button"
          >
            {{ i18n.t('season.previousPage') }}
          </Button>
          <span class="text-xs text-muted-foreground">
            {{ page }} / {{ pageCount }}
          </span>
          <Button
            @click="page++"
            :disabled="isAdding || page >= pageCount"
            size="sm"
            variant="outline"
            type="button"
          >
            {{ i18n.t('season.nextPage') }}
          </Button>
        </template>
        <Button
          @click="checkVisibleEpisodes(true)"
          v-if="canRecheck"
          size="sm"
          variant="ghost"
          type="button"
          class="ms-auto text-primary"
        >
          {{ i18n.t('season.recheck') }}
        </Button>
      </div>
      <p
        v-if="settings.isPaused"
        class="mt-2.5 text-xs text-primary"
        role="status"
      >
        {{ i18n.t('downloadPanel.theQueueIsPausedNewTasksWillWait') }}
      </p>
      <Button
        @click="addSelected(settings.quality)"
        :disabled="isSubmitDisabled"
        class="mt-3 h-10 w-full"
        type="button"
      >
        <DownloadIcon
          class="size-4 shrink-0"
          aria-hidden="true"
        />
        {{
          isAdding
            ? i18n.t('downloadPanel.addingToQueue')
            : i18n.t('season.addSelected', selectedEpisodeIds.length)
        }}
      </Button>
    </template>
    <p
      v-else
      class="my-4 text-[13px] text-muted-foreground"
    >
      {{ i18n.t('season.noEpisodes') }}
    </p>
  </template>
  <div
    v-if="seasonError || settingsError"
    class="mt-3 rounded-lg bg-accent p-3 text-xs leading-5 text-destructive"
    role="alert"
  >
    {{ seasonError || settingsError }}
    <Button
      @click="load"
      v-if="!season && !isLoading"
      variant="ghost"
      size="sm"
      type="button"
    >
      {{ i18n.t('downloadPanel.reload') }}
    </Button>
  </div>
  <p
    v-if="notice"
    class="mt-3 text-xs leading-5 text-primary"
    role="status"
  >
    {{ notice }}
  </p>
</template>
