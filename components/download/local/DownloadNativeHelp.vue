<script lang="ts" setup>
import { ChevronDownIcon } from '@lucide/vue'
import { i18n } from '~/utils/i18n'

const isExpanded = shallowRef(false)
const installationUrl = computed(
  () =>
    `https://github.com/ntnyq/bilibili-downloader/blob/main/docs/${i18n.t('localeCode') === 'zh-CN' ? 'zh/' : ''}advanced/native-bridge.md`,
)
</script>

<template>
  <Card class="gap-0 rounded-lg p-5 text-sm shadow-none">
    <Collapsible v-model:open="isExpanded">
      <h2>
        <CollapsibleTrigger as-child>
          <Button
            variant="ghost"
            type="button"
            class="h-auto w-full justify-between whitespace-normal p-0 text-left hover:bg-transparent"
            >{{ i18n.t('downloadNativeHelp.advancedLocalHelper')
            }}<ChevronDownIcon
              :class="isExpanded && 'rotate-180'"
              class="size-4 shrink-0"
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent class="mt-4 space-y-5 text-xs leading-6">
        <p class="text-muted-foreground">
          {{
            i18n.t(
              'downloadNativeHelp.browserDownloadsNeedNoPythonOrFfmpegInstallation',
            )
          }}
        </p>
        <section>
          <h3 class="font-medium">
            {{ i18n.t('downloadNativeHelp.handOffExtensionTasks') }}
          </h3>
          <p class="mt-2 text-muted-foreground">
            {{
              i18n.t(
                'downloadNativeHelp.afterInstallingAndRegisteringTheHelperOpenView',
              )
            }}
          </p>
          <Button
            :href="installationUrl"
            as="a"
            target="_blank"
            rel="noreferrer"
            variant="outline"
            class="mt-3"
            size="sm"
            >{{ i18n.t('downloadNativeHelp.installationGuide') }}</Button
          >
        </section>
        <section>
          <h3 class="font-medium">
            {{ i18n.t('downloadNativeHelp.standaloneCommandLineDownload') }}
          </h3>
          <p class="mt-2 text-muted-foreground">
            {{ i18n.t('downloadNativeHelp.commandLineInstructions') }}
            <a
              href="https://github.com/ntnyq/bilibili-downloader"
              target="_blank"
              rel="noreferrer"
              class="text-primary underline"
              >{{ i18n.t('downloadNativeHelp.projectRepository') }}</a
            >
          </p>
          <pre
            class="mt-2.5 whitespace-pre-wrap break-all rounded-lg bg-muted p-2.5 text-[11px] leading-5"
          ><code>python3 scripts/native-downloader.py task.bili.json --output-dir ./downloads</code></pre>
          <p class="mt-2 text-muted-foreground">
            {{
              i18n.t(
                'downloadNativeHelp.commandLineTasksRunIndependentlyAndDoNot',
              )
            }}
          </p>
        </section>
      </CollapsibleContent>
    </Collapsible>
  </Card>
</template>
