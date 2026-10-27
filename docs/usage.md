# Usage guide

[Documentation home](index.md) · [简体中文](zh/usage.md)

This guide covers downloads, queues, batch imports, assets, and file management. Start with the installation and quick start on the homepage.

## Downloading and managing tasks

Open `https://www.bilibili.com/video/...` and click **Download video** below the player. Multi-part videos default to the current part; choose all parts or a custom selection. The picker supports selecting, selecting all, inverting, and clearing, shows the count and total duration, and always preserves the original part order. You can also start downloads from the extension popup.

Quality preferences are saved and synchronized across interfaces. Queued tasks keep their submitted settings, including on retry. “Up to 720P” selects the highest available stream at or below 720P; if your account only receives 480P, that is what downloads. A task fails when no stream meets the cap rather than selecting a higher resolution.

Search the download center by title, BV ID, or part, filter failures, and retry all failed tasks. Bulk retry skips active duplicates and repeated parts; cancelled tasks can still be retried individually. Pausing the queue lets the current task finish and stops the next task from starting. This state survives refresh and does not pause the current network transfer. Changing the default quality only affects newly added tasks.

**Pause** beside a task stops its resolution, transfer, or remuxing and keeps committed media cache. Tasks already saving cannot be paused. **Resume** resolves fresh streams and validates cached data before continuing. A paused task does not block other queued tasks and remains paused after refresh; cancellation clears its browser cache. Move waiting tasks up or down to change their execution order.

Tasks run in the download center tab that opens in the background. **Keep the download center open while downloading.** Each part is saved separately under `Bilibili/` in the default download folder. Closing or refreshing the tab interrupts active work. Reopen it and retry: committed media fragments remain on disk, and fresh media URLs and cache validation determine whether the server allows resuming.

## Cache and large downloads

Video and audio are written to browser-private disk storage (OPFS) in chunks of at most 1 MiB and read on demand for remuxing. Network failures, tab closure, and refresh retain committed chunks. Retry the original task to resolve fresh links. Resuming requires the same resource, a strong ETag, and a valid Range response. Unsupported ranges, changed resources, or CDN changes safely restart that resource. Even complete cached tracks are revalidated with the server. Expired media URLs are refreshed automatically at most once, within your account permissions.

Successful saves and explicit cancellation clear the task cache. Orphaned cache from removed or evicted records is cleaned while the download center is idle. Cache for retained failed tasks remains available; inspect usage or clear it manually in the cache section. Cleanup is blocked while downloading or merging: pause the queue and wait for the current task to finish. Browsers may reclaim cache; insufficient space or quota produces an explicit error. Retention is not guaranteed. Asset exports retain their existing 16 MB in-memory flow.

Common DASH video and standalone AAC tracks are remuxed without re-encoding in a dedicated Worker. Output goes directly to OPFS and is saved from its disk file, without loading the complete output into WASM or JavaScript memory. Capacity follows available browser quota, with no fixed 16 GiB input cap. Checks use server lengths, valid cache, and actual writes; bitrate estimates only inform progress. Remuxing needs space for both input and output, plus the final download copy when saving. Fragmented MP4 / M4A output writes indexes incrementally to reduce long-video memory use; some older players and editors have lower compatibility. Legacy progressive FLV / MP4 uses browser FFmpeg with read-only WORKERFS inputs and synchronous random-access OPFS output, sharing the dynamic disk budget without the former 512 MiB limit.

When a server limits each Range response, downloads continue as long as validated responses make forward progress. Remuxing retains only the Worker startup timeout: after startup, long index parsing or writing does not fail merely because byte progress stops or 30 minutes elapse. Pause and cancel remain available.

The budget reserves missing input + approximately 105% of remuxed output + a 64 MiB safety margin. For a fresh task, the indicative input capacity is roughly half the available browser quota; already cached data is not reserved twice. Browser estimates are not actual system free space and may change, so checks repeat during downloading. Insufficient space retains valid input cache for a later retry after freeing space.

The local helper is optional. Export a `.bili.json` from a failed, cancelled, or completed video/audio task, then run it with Python 3 and installed FFmpeg:

```sh
python3 scripts/native-downloader.py /path/to/task.bili.json --output-dir ./downloads
```

The helper streams to disk, validates resume checkpoints, and remuxes without re-encoding outside browser quota limits. Task files contain temporary CDN URLs: keep them private and re-export after expiration. The standalone helper does not read cookies, run a local network service, or synchronize completion to the browser queue. See the [local helper guide](native-helper.md) for setup, resume, cleanup, and platform limits.

For automatic handoff, register the host using the [native integration guide](native-bridge.md), then hand off a paused or terminal video/audio task. First use requests optional `nativeMessaging` permission. The download center displays native progress and the final path, updating the queue and long-term history on success. Expired URLs are resolved by the browser using the original settings and current account permissions. Keep the download center open for native downloads too; after closure, hand off again to validate and resume local cache. Browser OPFS and native caches are separate and are not transferred between them.

## Batch sources

In the download center, choose a batch source, load a preview, then select videos to queue:

- **Link list:** one BV/av ID or complete HTTPS video URL per line. The `p` parameter is retained, invalid lines are reported separately, and duplicates are removed. Open short links in your browser first and copy the full destination URL.
- **Favorites:** paste a favorites URL containing `fid`, or enter its ID.
- **Collections / series:** paste a creator-space collection or series URL containing both the creator UID and collection/series ID.
- **Creator uploads:** paste a creator-space URL or UID to load ordinary videos from newest to oldest.

Online sources load one page at a time. Load the next page manually, up to 500 items per preview. Only loaded and selected items are imported; the extension does not automatically crawl an entire account. Empty lists, unavailable items, hidden content, and API failures have explicit feedback. Private favorites require login on Bilibili and appropriate access. The extension uses the browser session without reading or exporting cookies.

Choose only the linked part (P1 when `p` is absent), or expand all parts. Covers are always one per video. Asset type, subtitle language, quality, and saved file settings are snapshotted when first queuing and retained after session recovery. The background rechecks metadata, preserves source order, and always skips active duplicates. By default it also skips matching successful history; disable that option to download again. This does not scan disk: identity uses BV / CID / asset type / subtitle language, or BV alone for covers, irrespective of quality.

Source reads and enqueue metadata requests run serially with at least one second between batch operations. Failures are reported per video. Login, anti-abuse, network, or queue-capacity errors stop the import and retain already queued tasks. Stopping enqueue waits for the current request and does not cancel queued downloads. A video that would exceed 1,000 active tasks is rejected as a whole.

The latest batch session is saved locally, including source input, pages, preview, selection, and item results. Refreshing or reopening restores it and waits for you to continue reading or enqueueing; it does not automatically request pages or resume enqueueing. Changed sources require a new preview. Once import starts, options remain fixed; a new preview starts a new session. Conflicting edits from another download center require loading its latest session. Queue results and receipts are saved together, preventing duplicate submission if a response is lost. Queued tasks still follow the download center's normal recovery behavior.

## Asset exports

Choose an output in the video-page panel or popup:

| Content   | Output and limits                                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Video     | MP4 using the quality preference; the default behavior                                                                                                                      |
| Audio     | Highest-bitrate returned AAC track, remuxed to M4A without re-encoding; fails without standalone AAC                                                                        |
| Cover     | One original per BV, saved as JPG / PNG / WebP / GIF according to its actual format, independent of parts                                                                   |
| Subtitles | One SRT per part; automatic selection prefers Chinese and human subtitles within a language; Chinese or English can be requested explicitly; automatic subtitles are marked |
| Danmaku   | XML snapshot returned by the current API; not a complete historical archive and not burned into video                                                                       |

Missing subtitles/danmaku and login requirements have explicit reasons. Cover, subtitle, and danmaku inputs are each limited to 16 MB. Audio, subtitles, and danmaku support current / all / selected parts. Video and audio queue independently; subtitles deduplicate by selected language. Retrying preserves the original output type and subtitle language.

Asset bundles select multiple outputs at once using the existing part range, quality, and subtitle settings. Covers remain one per video, other assets one per selected part. Bundles force video directories; creator-based settings become creator/video directories. Active assets are skipped with a count. Capacity is validated for the entire bundle before one atomic enqueue, so capacity failure cannot add half a bundle. The download center reports saved, failed, cancelled, and remaining members. Missing subtitles do not count as bundle success, and failed assets can be retried independently.

## File settings and history

Open file settings and completion notifications in the download center or options page. Directory modes are flat, creator, video, or creator/video. Filename templates support `{title}`, `{bvid}`, `{page}`, `{part}`, `{partSuffix}`, `{owner}`, `{quality}`, and `{type}`, with live preview and automatic extensions. Invalid characters are replaced, long names truncated, and duplicate names receive browser-generated suffixes.

File settings are snapshotted when queuing; changes affect new tasks. Completion notifications default to off and request existing optional `notifications` permission when enabled. They fire only after the browser confirms saving; notification failures cannot turn a saved task into a failed task.

Queue JSON / CSV exports include only the current search and filter results: title, BV, part, type, state, and saved path, without cookies, temporary CDN URLs, or media bytes. Browser tasks show the requested path; use **Open folder** to inspect the actual file. Native tasks show the actual saved path. Ordinary terminal history retains roughly 100 records. Active bundles retain all members; terminal bundles are evicted as complete groups, with the newest group allowed up to 1,000 members. Record-file import is unsupported.

Long-term history independently records successful downloads with search, asset filters, pagination, exports, and requeue. The latest success replaces matching content; limits are 5,000 records and 3 MiB, evicting the oldest when exceeded. It stores neither media nor temporary CDN URLs. Upgrades migrate only successful queue records still retained at that moment. Clearing the queue keeps long-term history; deleting history stops its duplicate checks without deleting downloaded files. Requeue preserves quality and file settings but creates a fresh task and resolves current streams, subject to account permissions and active-task deduplication.

Actual quality depends on the account and returned streams. Equal resolution and frame rate favor SDR; equal quality favors compatible codecs. Browser remuxing dynamically reserves input/output disk space. Live streams, bangumi, interactive videos, and protected content are unsupported.
