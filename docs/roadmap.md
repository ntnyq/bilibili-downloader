# Capability roadmap

> Update 2026-10-27: DASH, progressive FLV / MP4, and standalone AAC now remux to browser disk. Capacity follows available quota while reserving input and output. The historical 512 MB limits below no longer apply; see [architecture](implementation.md#mp4-remuxing-and-resource-cleanup) and [verification](verification.md).

First planned: 2026-10-04; milestone update: 2026-10-05. Based on the video-download design discussion and implementation.

P0–P5 are implemented, including individual task controls, native handoff, and asset bundles. Release acceptance must still distinguish builds, simulated APIs, and real environments. See [verification records](verification.md) for evidence and gaps.

## Capability map

| Stage | Capability         | User value and limits                                                                                 |
| ----- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| P0    | Custom parts       | Current / all / custom; select/invert; original order; count and duration                             |
| P0    | Quality preference | Best available or up to 1080P / 720P / 480P; persisted default; immutable task snapshot               |
| P0    | Queue pause        | Let current work finish, stop new claims, persist across refresh                                      |
| P0    | Queue management   | Title/BV/part search, failure filter, bulk retry with deduplication                                   |
| P1    | Asset exports      | M4A, original covers, SRT, danmaku XML, explicit missing-asset states                                 |
| P1    | File organization  | Templates, creator/video directories, optional notifications, JSON/CSV records                        |
| P2    | Large tasks        | OPFS chunks, safe Range resume, URL refresh, local FFmpeg CLI                                         |
| P2    | Batch sources      | Links, favorites, collections/series, uploads; pagination, throttling, access feedback, deduplication |
| P3    | Session recovery   | Latest batch source/pages/selection/options/results, with manual continuation                         |
| P3    | Long-term history  | Independent successes, search/filter/export/requeue, cross-queue deduplication                        |
| P3    | Task controls      | Pause with retained cache, resume, reorder waiting tasks                                              |
| P4    | Native integration | Native handoff, progress/results, bounded expired-link refresh                                        |
| P5    | Asset bundles      | Multiple asset types, video directories, whole-bundle completion/failure                              |

## P0 behavior contracts

- Keep single-video one-click downloads and current-part defaults.
- Send selected page numbers; the background refetches metadata and validates every page. Reject empty/stale selections and deduplicate in source order.
- Quality is a cap, not an access promise. Select only returned streams within it; fail for unknown or unavailable matching quality. Portrait video uses the short edge.
- Default to best available; schema defaults migrate old tasks. Store preference per task and preserve it on retry; changed defaults do not modify existing tasks.
- Queue pause controls scheduling, not transfer/resume. Current download/remux/save finishes.
- Persist settings/pause in `storage.local`, serialize background updates, and synchronize with `storage.onChanged`.
- Bulk retry handles failures only, skips active duplicates and repeated parts, and validates the 1,000-task capacity. Cancelled items still retry individually.
- This stage adds no permissions, runtime dependencies, or media-storage changes.

## Component and logic boundaries

| Module                        | Responsibility / contract                                       |
| ----------------------------- | --------------------------------------------------------------- |
| DownloadPanel                 | Compose metadata, pickers, submit, and progress; accept url     |
| DownloadPartPicker            | pages/currentPage inputs; mode/selectedPages models; scope only |
| DownloadQuality               | quality model and disabled state                                |
| DownloadQueue                 | Query, filtering, pause/resume, bulk operations                 |
| useVideoDownload              | Page parsing, parts, stale-response protection, enqueue         |
| useDownloadSettings           | Load/sync/update persisted settings with loading/errors         |
| downloads/model               | Pure part validation, creation, retry deduplication, scheduling |
| background/services/downloads | Validate messages and serialize queue/settings                  |
| bilibili/streams              | Select by returned resolution and cap                           |

## Implementation and acceptance

1. Extend types, messages, queue functions, and stream strategy with boundary tests.
2. Add settings persistence and background pause/retry; runner uses task snapshots.
3. Build pink-theme pickers, search/filter/actions, and usage documentation.
4. Run tests, formatting, lint, types, and Chromium / Firefox builds.
5. Load Chromium production output; verify parts, snapshots, pause/resume, search, deduplication, real FFmpeg output, and narrow layouts. Retain screenshots and identify simulated APIs. Firefox runtime verification depends on a usable environment.

## P0 completion

All four P0 features are implemented. The original stage passed 21 unit tests, formatting, lint, types, and both production builds. Chromium verified task snapshots, settings synchronization, pause/resume, real WASM saves, bulk deduplication, and narrow layouts. See [verification](verification.md); later stages follow.

## P1 contracts: 2026-10-04

1. Add asset type, subtitle language, creator, and file-setting snapshots. Migrate old tasks to MP4 defaults. Deduplicate by BV / CID / type / language, or BV alone for covers.
2. M4A selects the highest-bitrate actual AAC track without video or transcoding. Reject missing audio, previews, and DRM. At this stage media input still had a 512 MB limit.
3. Save one cover per video, using image signatures for extensions. Subtitles are SRT per part, automatically preferring Chinese and human subtitles within a language. Explicit Chinese/English never silently falls back. Danmaku is a current XML snapshot, not all history. Each image/text input is limited to 16 MB.
4. Templates allow only listed variables; fixed directory modes stay under Bilibili. Sanitize each path component and bound its UTF-8 bytes. Reuse downloads completion/cancellation and Blob cleanup.
5. Notifications default off and request optional permission in a settings click gesture; notify only after saving. Export only filtered user-visible metadata, with CSV formula-prefix escaping.
6. Add `https://comment.bilibili.com/*` host access and extension-only Referer rules. Reuse optional notifications permission without runtime dependencies.

### P1 module boundaries

| Module                      | Responsibility                                         |
| --------------------------- | ------------------------------------------------------ |
| DownloadAssetPicker         | kind / subtitleLanguage models; output/language only   |
| DownloadFileSettings        | Naming/directory preview, save feedback, notifications |
| useDownloadFileSettings     | Draft, validation, preview, permission gesture         |
| useDownloadHistory          | Export using call-time filters; save/error state       |
| bilibili/subtitles, cover   | Subtitle selection/SRT and image signatures            |
| downloads/exportAsset       | Download/validate assets; return Blob/format           |
| downloads/filename, history | Pure safe paths and record formatting                  |
| downloads/runner            | Dispatch by type; reuse queue/cancel/save/completion   |

Acceptance includes old-task migration, simultaneous assets, cover deduplication, AAC-only output, subtitle timing, missing assets, file snapshots, filtered exports, denied permission, and completion notifications.

P1 passed 32 tests, static checks, and both builds. Chromium verified five actual saved formats, errors/cancellation/retry, snapshots, and exports. System notifications, real-account asset permissions, and Firefox runtime remain bounded as documented in [verification](verification.md).

## P2 batch sources: 2026-10-05

Batch sources preceded large-task support. Browser input was still limited to 512 MB. The contracts below describe that milestone; P3 later extends history and session persistence in items 6 and 7.

### Behavior contracts

1. Offer links, favorites, collections/series, and uploads in the download center. Preview before selection; load pages manually, up to 500 preview items.
2. Accept one BV/av ID or complete HTTPS video URL per line, retaining `p`, reporting invalid lines, and deduplicating video/part. Resolve av/BV aliases again in the background before task deduplication.
3. Respect current account access with fixed API hosts and known URL shapes. Validate raw APIs with Zod; restricted/unavailable items cannot appear downloadable.
4. Serialize and throttle source reads and enqueue metadata with at least one second between operations. Network waits do not hold the queue lock. Login/anti-abuse/network errors stop without automatic retry.
5. Enqueue videos in preview order after background metadata revalidation. Select linked or all parts. Submit each video atomically; exceeding 1,000 active tasks rejects that video and keeps prior results.
6. Always deduplicate active tasks. Optionally skip successful retained history by default; failed/cancelled records can import again. Identity excludes quality and uses BV / CID / type / language, or BV for covers. At this stage success history meant only the latest 100 terminal queue records, without disk inspection.
7. Freeze type/language/quality/file settings at batch start. Stop after the current request without altering existing tasks. Closing the page stops new requests. At this stage previews were in memory and sessions did not survive refresh.
8. Reuse queue, assets, and save flows without new permissions or runtime dependencies.

### Module boundaries

| Module                          | Responsibility                                            |
| ------------------------------- | --------------------------------------------------------- |
| `types/batch`                   | Source, candidate, pagination contracts                   |
| `bilibili/batch`                | Input parsing, source API, normalized pagination          |
| `downloads/batch`               | Success skips, active capacity, atomic creation           |
| `background/services/downloads` | Throttle, source reads, metadata rechecks, serial enqueue |
| `useBatchImport`                | Preview, selection, pages, snapshots, item results, stop  |
| `download/batch`                | Source form, preview list, options, container             |

Acceptance covers pagination, invalid/duplicate links, aliases, hidden/unavailable items, access/anti-abuse, partial success, stop, capacity, snapshots, and desktop/narrow layouts. See [verification](verification.md).

The stage passed 53 tests, static checks, and both builds. Chromium verified simulated-source imports and real MP4 saving. Anonymous favorites/series APIs worked; collections/uploads returned `-352`. Authenticated success and Firefox runtime still need verification.

## P2 large tasks: 2026-10-05

### Behavior contracts

1. Write immutable OPFS chunks and update metadata atomically only after committing files. Refresh loses at most uncommitted chunks; corrupt/orphaned pieces never enter output. Cache keys include BV/CID, media kind, and the complete selected-track representation, without temporary URLs.
2. Resolve again on retry. Append only for matching host/path, strong ETag, total size, and exact Content-Range. `200` resets, `206`/`416` validate, weak/missing ETag or changed track/CDN restarts. Revalidate complete cache; refresh expired links at most once.
3. Mount cached Blobs read-only through WORKERFS to reduce copies. At this stage output still used WASM memory and a 512 MB input budget checked before and during transfer.
4. Success/explicit cancel clears cache; failure/interruption retains it. Clean removed-record orphans while idle under the same cross-tab lock as execution. Quota failure is explicit, without unlimitedStorage or silently deleting retryable cache.
5. Export terminal media tasks as versioned `.bili.json`, resolving current account streams and preserving quality/naming/directories. Temporary URLs are not permanent replay credentials and contain no cookies.
6. The Python standard-library helper validates manifests, HTTPS CDN/redirects, paths, and cache; streams to disk; invokes installed FFmpeg with fixed copy arguments; and never overwrites. It is outside browser limits, retains failure checkpoints, and requires re-export for expired links. Standalone mode has no server or browser-state synchronization.
7. No new extension permissions or JS runtime dependencies. Python/FFmpeg are optional prerequisites. Keep the download center open; queue pause only blocks next claims.

### Module boundaries

| Module                                      | Responsibility                                           |
| ------------------------------------------- | -------------------------------------------------------- |
| `downloads/mediaCache`                      | OPFS chunks/metadata, recovery, usage, cleanup           |
| `downloads/resumableMedia`                  | Conditions, Range, timeout, budgets, alternate URLs      |
| `downloads/mergeMedia`                      | Original read-only mounts, real FFmpeg, Worker lifecycle |
| `downloads/runner`                          | URL refresh, cache lock, queue/save orchestration        |
| `downloads/nativeManifest`, `nativeTask`    | Export validation and task files                         |
| `DownloadCache`, `useDownloadCache`         | Usage, safe cleanup, large-task guidance                 |
| `DownloadNativeExport`, `useNativeDownload` | Per-task export state/lifecycle                          |
| `scripts/native-downloader.py`              | Disk streaming/resume and FFmpeg remuxing                |

See [verification](verification.md) and the [local helper](native-helper.md).

## P3 session recovery and long-term history: 2026-10-05

The next-stage planning discussion prioritized batch recovery and independent successes.

### Behavior contracts

1. Persist the latest source input/parsed source/pages/preview/selection/errors/results. Restore without automatic batch requests; in-flight pages do not advance, and uncommitted items remain retryable.
2. First enqueue freezes asset/language/part scope/quality/file settings. Recovery keeps them regardless of default changes. A fresh preview creates a new session.
3. Background serial writes compare revisions, preventing stale windows from overwriting others. Reload after conflict. Limit sessions to 500 items / 1 MiB with explicit errors.
4. Validate session/item/options before and at commit. Save queue and receipts in one `storage.local` write. After response loss, replay receipts even if tasks completed, were cleared, or success skipping is disabled. Failures with no committed tasks remain retryable.
5. Store latest successful asset identities independently of 100 terminal queue entries, up to 5,000 / 3 MiB. Evict oldest and show cumulative evictions. Store metadata/settings, never cookies/media/temporary URLs.
6. Migrate retained successful queue records once. Empty migrated history does not reimport. Only new completions archive, so deleting history cannot be undone by later progress. Queue cleanup keeps history; history deletion keeps disk files.
7. Support search/type/page/export/delete/requeue. Requeue preserves snapshots with a new ID and cleared execution state. Batch skips use independent history by default; active duplicates are always blocked.
8. Reuse permissions/dependencies. Surface failed storage writes without claiming unsaved sessions are saved. Budgets leave queue space under [Chrome storage limits](https://developer.chrome.com/docs/extensions/reference/api/storage), without unlimitedStorage.

### Module boundaries

| Module                                         | Responsibility                                            |
| ---------------------------------------------- | --------------------------------------------------------- |
| `types/batchSession`, `downloads/batchSession` | Validation, revisions, recovery, receipts                 |
| `useBatchImport`, `download/batch`             | Draft/preview/recovery/options/manual continue            |
| `types/downloadHistory`, `downloads/library`   | Migration, budgets, identity, fresh tasks                 |
| `useDownloadLibrary`, `DownloadLibrary`        | Sync, search/pages/export/actions                         |
| `background/services/downloads`                | Serial commits, atomic queue/receipts, completion archive |

### P3 session/history verification

This stage passed 94 JS/TS tests, 25 helper tests, static checks, both builds, and Chromium recovery/conflict/history checks. See [verification](verification.md) for scenarios and fixture boundaries.

## P3 task controls: 2026-10-05

- Per-task `paused` is distinct from queue pause, remains active for capacity/deduplication/cache retention, and does not block other waiting tasks.
- Pause revokes `runId`; stale requests/progress cannot overwrite paused/fresh runs. Every runner stage requires background confirmation. Saving rejects pause.
- Pausing transfer/remux retains committed OPFS chunks; resume resolves and validates again. Cancel clears cache. Refresh does not fail paused tasks.
- Move adjacent waiting tasks up/down through serial background writes; display/execution order match. Running tasks are not moved.

## P4 native integration: 2026-10-05

- Use optional `nativeMessaging` and an allowlisted host over stdin/stdout, without local HTTP. Users run registration; Chrome origins / Firefox IDs are exact. The extension cannot install the host itself.
- Paused/terminal media can hand off with a fresh token and `native` state, excluding duplicate browser/window execution.
- Progress/final paths update the queue; success enters history and batch deduplication. Cancellation/interruption revokes old writes. Keep the center open for communication.
- Reuse disk streaming, path/CDN/ETag/hash checks, fixed FFmpeg arguments, and non-overwriting saves. Expiration asks the browser for bounded refresh using original settings; changed identities cannot mix.
- Python/FFmpeg, registration, and platform configuration are optional prerequisites. The historical browser 512 MB cap still applied at this milestone. See [native integration](native-bridge.md).

## P5 asset bundles: 2026-10-05

- Keep single-asset mode; bundle mode selects video/audio/cover/subtitles/danmaku with shared scope/quality/language.
- Refetch metadata and validate all members before one write. Skip active assets; covers are one per BV, others per selected part. All active-bundle members count toward 1,000 retained slots. New tasks must fit a 4 MiB queue budget with growth headroom; reject oversized bundles atomically.
- New members record `bundleId` / `bundleSize`, keep naming snapshots, and force video or creator/video folders. Skipped existing tasks keep their original membership.
- Summarize saved/failed/cancelled/missing members; only all-saved means bundle complete. Retry remains per asset with original settings.
- Active-bundle terminal members survive ordinary 100-record pruning and cleanup. Completed bundles evict whole; the newest may exceed 100 but cannot exceed 1,000 members.

## Release acceptance

See [verification](verification.md) for automated and local browser evidence. Real authenticated access, long CDN resume, GB-scale stress, Windows helpers, and working Firefox runtime still require their corresponding environments; simulations and successful builds cannot replace them.

## References

- [yt-dlp Bilibili extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/bilibili.py): treat only returned streams as downloadable.
- [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage): persistence and cross-context updates.
- [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system): private storage and quotas.
- [HTTP conditions and ranges](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-range): strong validators and partial responses.
- [WORKERFS](https://emscripten.org/docs/api_reference/Filesystem-API.html#workerfs): read-only File / Blob mounting.
