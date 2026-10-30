<script lang="ts" setup>
import { useDownloadCache } from '~/composables/useDownloadCache'
import { formatBytes } from '~/utils/downloads/format'
import { i18n } from '~/utils/i18n'

const {
  stats,
  availableBytes,
  isRefreshing,
  isClearing,
  error: cacheError,
  notice,
  refresh,
  clear,
} = useDownloadCache()
</script>

<template>
  <Card class="gap-4 py-5 shadow-none">
    <CardHeader class="px-5"
      ><CardTitle class="text-sm">{{
        i18n.t('downloadCache.browserDownloadCache')
      }}</CardTitle></CardHeader
    >
    <CardContent class="px-5">
      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-muted-foreground">
          <template v-if="stats">{{
            i18n.t('downloadCache.mediaCacheEntries', [
              formatBytes(stats.bytes),
              stats.entries,
            ])
          }}</template>
          <template v-else>
            {{
              isRefreshing
                ? i18n.t('downloadCache.loadingDownloadCache')
                : i18n.t('downloadCache.downloadCacheUnavailable')
            }}
          </template>
        </p>
        <div class="flex items-center gap-4">
          <Button
            @click="refresh"
            :disabled="isRefreshing || isClearing"
            variant="ghost"
            size="sm"
            type="button"
            class="text-muted-foreground hover:text-primary disabled:opacity-50"
            >{{ i18n.t('downloadCache.refreshUsage') }}</Button
          >
          <Button
            @click="clear"
            :disabled="isClearing"
            variant="ghost"
            size="sm"
            type="button"
            class="text-muted-foreground hover:text-primary disabled:opacity-50"
          >
            {{
              isClearing
                ? i18n.t('downloadCache.clearing')
                : i18n.t('downloadCache.clearDownloadCache')
            }}
          </Button>
        </div>
      </div>
      <p class="mt-2.5 text-[12px] text-muted-foreground leading-5">
        <template v-if="availableBytes !== null">{{
          i18n.t('downloadCache.approximatelyOfBrowserQuotaRemaining', [
            formatBytes(availableBytes),
          ])
        }}</template
        >{{ i18n.t('downloadCache.thereIsNoFixedMediaInputSizeLimit') }}
      </p>
      <p class="mt-2.5 text-[12px] text-muted-foreground leading-5">
        {{
          i18n.t('downloadCache.retriesAfterFailureOrRefreshWillReuseCached')
        }}
      </p>
      <Alert
        v-if="cacheError"
        class="mt-2.5 text-destructive"
        variant="destructive"
        ><AlertDescription>
          {{ cacheError }}
        </AlertDescription></Alert
      >
      <p
        v-if="notice"
        class="mt-2.5 text-primary"
        role="status"
      >
        {{ notice }}
      </p>
    </CardContent>
  </Card>
</template>
