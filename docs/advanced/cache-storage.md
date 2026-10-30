# Cache and large downloads

Browser downloads keep resumable media on disk and reserve space for remuxing. Large tasks also run directly in the browser without Python or installed FFmpeg, with capacity checked dynamically against available disk quota.

::: tip Recover before clearing
Retry the original task first. Clear cache only after pausing the queue and waiting for active downloading or remuxing to stop. Cleanup removes data that could otherwise be reused.
:::

## Resume conditions

Video and audio are written to browser-private disk storage (OPFS) in chunks of at most 1 MiB and read on demand for remuxing. Network failures, tab closure, and refresh retain committed chunks. Retry the original task to resolve fresh links. Resuming requires the same resource, a strong ETag, and a valid Range response. Unsupported ranges, changed resources, or CDN changes safely restart that resource. Even complete cached tracks are revalidated with the server. Expired media URLs are refreshed automatically at most once, within your account permissions.

## Inspect and clear cache

Successful saves and explicit cancellation clear the task cache. Orphaned cache from removed or evicted records is cleaned while the download center is idle. Cache for retained failed tasks remains available; inspect usage or clear it manually in the cache section. Cleanup is blocked while downloading or merging: pause the queue and wait for the current task to finish. Browsers may reclaim cache; insufficient space or quota produces an explicit error. Retention is not guaranteed. Asset exports retain their existing 16 MB in-memory flow.

## Browser remuxing

Common DASH video and standalone AAC tracks are remuxed without re-encoding in a dedicated Worker. Output goes directly to OPFS and is saved from its disk file, without loading the complete output into WASM or JavaScript memory. Capacity follows available browser quota, with no fixed 16 GiB input cap. Checks use server lengths, valid cache, and actual writes; bitrate estimates only inform progress. Remuxing needs space for both input and output, plus the final download copy when saving. Fragmented MP4 / M4A output writes indexes incrementally to reduce long-video memory use; some older players and editors have lower compatibility. Legacy progressive FLV / MP4 uses browser FFmpeg with read-only WORKERFS inputs and synchronous random-access OPFS output, sharing the dynamic disk budget without the former 512 MiB limit.

## Long-running tasks

When a server limits each Range response, downloads continue as long as validated responses make forward progress. Remuxing retains only the Worker startup timeout: after startup, long index parsing or writing does not fail merely because byte progress stops or 30 minutes elapse. Pause and cancel remain available.

## Disk budget

The budget reserves missing input + approximately 105% of remuxed output + a 64 MiB safety margin. For a fresh task, the indicative input capacity is roughly half the available browser quota; already cached data is not reserved twice. Browser estimates are not actual system free space and may change, so checks repeat during downloading. Insufficient space retains valid input cache for a later retry after freeing space.

## Advanced: local helper

Use the optional helper when you need storage outside browser quota or native FFmpeg. Setup and usage are in the collapsed advanced options under **下载缓存** (Download cache). In a failed, cancelled, or completed video/audio task, open **查看详情** (View details) → **高级选项：本地助手** (Advanced: local helper) → **导出本地任务** (Export local task), then run the `.bili.json` with Python 3 and installed FFmpeg:

```sh
python3 scripts/native-downloader.py /path/to/task.bili.json --output-dir ./downloads
```

The helper streams to disk, validates resume checkpoints, and remuxes without re-encoding outside browser quota limits. Task files contain temporary CDN URLs: keep them private and re-export after expiration. The standalone helper does not read cookies, run a local network service, or synchronize completion to the browser queue. See the [local helper guide](native-helper.md) for setup, resume, cleanup, and platform limits.

For automatic handoff, register the host using the [native integration guide](native-bridge.md), then expand the advanced options in a paused or terminal video/audio task's details and choose **交给本地助手** (Hand to local helper). First use requests optional `nativeMessaging` permission. The download center displays native progress and the final path, updating the queue and long-term history on success. Expired URLs are resolved by the browser using the original settings and current account permissions. Keep the download center open for native downloads too; after closure, hand off again to validate and resume local cache. Browser OPFS and native caches are separate and are not transferred between them.

[Having trouble? See troubleshooting](../help/troubleshooting.md).
