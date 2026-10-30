<script lang="ts" setup>
import {
  FolderIcon,
  HardDriveIcon,
  HistoryIcon,
  InfoIcon,
  LayersIcon,
  ListPlusIcon,
  ListVideoIcon,
  PlusIcon,
  Settings2Icon,
} from '@lucide/vue'
import SidebarMenuButton from '~/components/ui/sidebar/SidebarMenuButtonChild.vue'
import { useDownloadQueue } from '~/composables/useDownloadQueue'
import { i18n } from '~/utils/i18n'
import DownloadBatchImport from './batch/DownloadBatchImport.vue'

defineProps<{
  runnerError: string
}>()
const { jobs } = useDownloadQueue()
const sections = [
  {
    id: 'queue',
    get label() {
      return i18n.t('downloadWorkspace.downloadQueue')
    },
    get description() {
      return i18n.t('downloadWorkspace.trackProgressAndManageYourDownloads')
    },
    icon: ListVideoIcon,
  },
  {
    id: 'bundles',
    get label() {
      return i18n.t('downloadWorkspace.assetBundles')
    },
    get description() {
      return i18n.t('downloadWorkspace.viewAssetsAndBundleResultsByVideo')
    },
    icon: LayersIcon,
  },
  {
    id: 'batch',
    get label() {
      return i18n.t('downloadWorkspace.batchImport')
    },
    get description() {
      return i18n.t('downloadWorkspace.reviewVideosAndAddThemToTheQueue')
    },
    icon: ListPlusIcon,
  },
  {
    id: 'library',
    get label() {
      return i18n.t('downloadWorkspace.downloadHistory')
    },
    get description() {
      return i18n.t('downloadWorkspace.findSavedAssetsOrDownloadThemAgainWith')
    },
    icon: HistoryIcon,
  },
  {
    id: 'local',
    get label() {
      return i18n.t('downloadWorkspace.downloadCache')
    },
    get description() {
      return i18n.t(
        'downloadWorkspace.checkBrowserStorageUsageAndManageResumableDownloads',
      )
    },
    icon: HardDriveIcon,
  },
] as const
const activeSection = shallowRef('queue')
const currentSection = computed(
  () =>
    sections.find(section => section.id === activeSection.value) || sections[0],
)
</script>

<template>
  <div
    class="grid min-h-[calc(100vh-62px)] grid-cols-1 md:grid-cols-[184px_minmax(0,1fr)]"
  >
    <aside
      class="flex flex-wrap gap-1 border-b bg-background p-2 md:flex-col md:border-r md:border-b-0 md:px-3 md:py-6"
    >
      <SidebarContent class="overflow-visible">
        <nav
          :aria-label="i18n.t('downloadWorkspace.downloadCenterNavigation')"
          class="flex flex-1 flex-col"
        >
          <SidebarMenu class="flex-row flex-wrap md:flex-1 md:flex-col">
            <SidebarMenuItem
              v-for="section in sections"
              :key="section.id"
              :class="section.id === 'local' && 'md:mt-auto'"
            >
              <SidebarMenuButton
                @click="activeSection = section.id"
                :is-active="activeSection === section.id"
                :aria-current="
                  activeSection === section.id ? 'page' : undefined
                "
                class="h-9 gap-2.5 text-xs"
              >
                <component :is="section.icon" /><span>{{ section.label }}</span
                ><span
                  v-if="section.id === 'queue'"
                  class="ml-auto tabular-nums"
                  >{{ jobs.length }}</span
                >
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem
              ><SidebarMenuButton
                as="a"
                href="/options.html"
                target="_blank"
                rel="noreferrer"
                class="h-9 gap-2.5 text-xs"
                ><Settings2Icon /><span>{{
                  i18n.t('downloadWorkspace.settings')
                }}</span></SidebarMenuButton
              ></SidebarMenuItem
            >
          </SidebarMenu>
        </nav>
      </SidebarContent>
      <SidebarFooter
        class="hidden pt-6 text-[11px] leading-5 text-muted-foreground md:flex"
      >
        <Separator class="mb-2" />
        <div><FolderIcon class="mr-1 inline size-4" />Bilibili</div>
        <span>{{
          i18n.t('downloadWorkspace.browserDefaultDownloadFolder')
        }}</span>
      </SidebarFooter>
    </aside>
    <main class="flex min-w-0 bg-muted p-3 sm:p-5 lg:p-6">
      <div class="min-w-0 flex-1 rounded-xl bg-background p-4 sm:p-6 lg:p-8">
        <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-semibold tracking-tight">
              {{ currentSection.label }}
            </h1>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ currentSection.description }}
            </p>
          </div>
          <Button
            @click="activeSection = 'batch'"
            v-if="activeSection === 'queue'"
            ><PlusIcon class="size-4" />{{
              i18n.t('downloadWorkspace.batchImport')
            }}</Button
          >
        </header>
        <p
          v-if="activeSection !== 'batch' && activeSection !== 'library'"
          class="mb-6 flex items-start gap-2 text-xs text-muted-foreground"
        >
          <InfoIcon
            class="size-4 shrink-0"
            aria-hidden="true"
          />{{
            i18n.t('downloadWorkspace.keepThisPageOpenWhileDownloadingYouCan')
          }}
        </p>
        <Alert
          v-if="runnerError"
          class="mb-4 text-sm text-destructive"
          variant="destructive"
          ><AlertDescription>
            {{ runnerError }}
          </AlertDescription></Alert
        >
        <!-- Keep feature instances mounted: navigation must not stop imports or native tasks. -->
        <DownloadQueue v-show="activeSection === 'queue'" />
        <DownloadBundles v-show="activeSection === 'bundles'" />
        <DownloadBatchImport v-show="activeSection === 'batch'" />
        <DownloadLibrary v-show="activeSection === 'library'" />
        <section
          v-show="activeSection === 'local'"
          :aria-label="i18n.t('downloadWorkspace.downloadCache')"
          class="space-y-5"
        >
          <DownloadCache />
          <DownloadNativeHelp />
        </section>
        <footer
          v-if="activeSection !== 'batch' && activeSection !== 'library'"
          class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"
        >
          <span>{{
            i18n.t('downloadWorkspace.eachPartIsSavedSeparatelyDownloadsRunIn')
          }}</span>
          <Button
            @click="activeSection = 'local'"
            variant="ghost"
            size="sm"
            class="text-primary"
            >{{ i18n.t('downloadWorkspace.manageDownloadCache') }}</Button
          >
        </footer>
      </div>
    </main>
  </div>
</template>
