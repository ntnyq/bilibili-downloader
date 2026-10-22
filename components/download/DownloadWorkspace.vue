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
import { useDownloadQueue } from '~/composables/useDownloadQueue'
import DownloadBatchImport from './batch/DownloadBatchImport.vue'

defineProps<{
  runnerError: string
}>()
const { jobs } = useDownloadQueue()
const sections = [
  {
    id: 'queue',
    label: '下载队列',
    description: '查看进度，管理每一份正在保存的内容。',
    icon: ListVideoIcon,
  },
  {
    id: 'bundles',
    label: '素材组合',
    description: '按视频查看素材归档和组合下载结果。',
    icon: LayersIcon,
  },
  {
    id: 'batch',
    label: '批量导入',
    description: '先确认视频，再按你的偏好加入下载队列。',
    icon: ListPlusIcon,
  },
  {
    id: 'library',
    label: '下载历史',
    description: '查找保存过的素材，或按原设置再次下载。',
    icon: HistoryIcon,
  },
  {
    id: 'local',
    label: '缓存与本地助手',
    description: '管理浏览器磁盘缓存，或按需连接本地助手。',
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
          class="flex flex-1 flex-col"
          aria-label="下载中心导航"
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
                ><Settings2Icon /><span>设置</span></SidebarMenuButton
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
        <span>浏览器默认下载目录</span>
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
            ><PlusIcon class="size-4" />批量导入</Button
          >
        </header>
        <p
          v-if="activeSection !== 'batch' && activeSection !== 'library'"
          class="mb-6 flex items-start gap-2 text-xs text-muted-foreground"
        >
          <InfoIcon
            class="size-4 shrink-0"
            aria-hidden="true"
          />
          下载期间请保持此页打开，你可以继续浏览其他标签页。
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
          class="space-y-5"
          aria-label="缓存与本地助手"
        >
          <DownloadCache />
          <Card class="gap-0 rounded-lg p-5 text-sm shadow-none">
            <h2 class="font-semibold">连接本地助手</h2>
            <p class="mt-2 text-xs leading-6 text-muted-foreground">
              安装本地助手后，在下载队列的音视频任务中点击「交给本地助手」。可处理已暂停、失败、取消或完成的任务，下载中心会显示本地处理状态。
            </p>
            <Button
              as="a"
              href="https://github.com/ntnyq/bilibili-downloader/blob/main/docs/native-bridge.md"
              target="_blank"
              rel="noreferrer"
              variant="outline"
              class="mt-4 self-start"
              size="sm"
              >查看安装说明</Button
            >
          </Card>
        </section>
        <footer
          v-if="activeSection !== 'batch' && activeSection !== 'library'"
          class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"
        >
          <span>每个分 P 独立保存 · 按队列顺序下载</span>
          <Button
            @click="activeSection = 'local'"
            variant="ghost"
            size="sm"
            class="text-primary"
            >缓存与可选本地助手</Button
          >
        </footer>
      </div>
    </main>
  </div>
</template>
