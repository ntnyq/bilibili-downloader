# Verification records

Latest verification date: 2026-10-27. Earlier milestone records remain below. Their 512 MB / WASM-output limits were replaced by disk remuxing, and the subsequent fixed 16 GiB input limit was replaced by dynamic disk budgeting.

## Automated checks

| Check                | Result                    |
| -------------------- | ------------------------- |
| `pnpm test`          | 325 tests passed          |
| `pnpm test:native`   | 38 tests passed           |
| `pnpm format:check`  | Passed                    |
| `pnpm lint`          | Passed                    |
| `pnpm typecheck`     | Passed                    |
| `pnpm build`         | Chromium MV3 build passed |
| `pnpm build:firefox` | Firefox MV3 build passed  |
| `git diff --check`   | Passed                    |

The production package is approximately 34 MB, including about 32 MB of bundled FFmpeg WASM. Chromium checks covered the download center, welcome, and options pages. Firefox was build-only in this round.

## Input single-moof sample paging: 2026-10-27

Input `moof/traf` traversal separates fixed headers from source-backed trun rows. Each track fragment retains four copied 16 KiB pages, 128 adaptive summaries, 256 raw samples and 512 computed durations, without full sample/run-count/sorted-PTS arrays. First use streams summaries; default-only runs accumulate arithmetically. Reordered durations use 256-sample windows and candidate-block rescans. Fragment `senc` / `saiz/saio` retain locations, with at most 128 variable-size auxiliary checkpoints.

- Added 32 regressions (325 Node tests total). Every packet and duration is checked for forward/reverse/shuffled/tied PTS, first/default/per-row flags, 1/263/2,003-sample runs and mixed default/explicit runs. Tests cover concurrent seek, held packets, eviction/retry/disposal, 5 GiB moof padding and absolute bases, malformed metadata, ESM and both CommonJS bundles. Explicit rows exceed the former 2^20 limit; default-run arithmetic and key lookup cover about 4.29 billion samples without allocating their media.
- Four encrypted variants compare AES-CTR plaintext for fixed-IV senc, variable-subsample senc, and variable/fixed saiz with saio. Metadata-only queries do not request keys.
- Isolated GC processes generate 20k/400k samples in one run and one run per sample, requiring retained heap below 4 MiB, buffers below 1 MiB and scale growth below 2 MiB/512 KiB. Sparse single-run measurements were about 0.31/0.34 MiB heap and 0.21/0.20 MiB buffers. Parser pages returned as views into 8 MiB Node Buffers verify copying. With identical 400k-sample Blob inputs and queries, the previous implementation retained about 68.6 MiB heap/6.1 MiB buffers, versus 0.39 MiB heap/64 KiB buffers now. Source media and prewarmed track discovery are excluded; these are not process peaks.
- Chromium ran the packaged production Worker at the extension origin with real twelve-second H.264/B-frame video plus short audio, and three synthetic input fragments of 30,003 samples each. Both completed OPFS output. HTTP instrumentation observed maximum 128 KiB Blob reads and 64 KiB OPFS reads/writes, eight opens/eight closes per job, zero-length released descriptor/media/sort files and no job-directory remnants. Real CDN/download APIs, Firefox runtime and native playback were not covered.
- Node/Python tests, formatting, lint, types, Chromium/Firefox builds, frozen-lockfile install and diff checks pass. Entry points: `tests/downloads/mp4Moof.test.ts` and `tests/fixtures/downloads/mp4MoofMemory.ts`; comparison/browser artifacts remain under ignored `output/size-audit/`.

These bounds cover retained per-fragment sample metadata. Initial scans and arbitrary reordered lookup may increase CPU/I/O. Caller-held fragments, individual packets/subsamples, source caches, codec/other leaf boxes and ordinary-MP4 encryption auxiliary tables retain separate costs. This does not promise constant whole-task or peak memory; historical limits below describe their respective stages.

## Paged GOP descriptors and external timestamp sorting: 2026-10-27

The production output path now writes fixed 56-byte sample records and media to positional files as packets arrive. Two 56 KiB record pages per track replace current-fragment/GOP/queue arrays. Timestamps use a fixed 4,096-value run buffer and two external merge files with at most 64 KiB pages. Scalar summaries choose trun fields, and entries stream directly instead of constructing a full moof tree. Completed prefixes compact in pages, preserve queued logical references and reuse four files per track.

- Added 31 regressions (293 Node tests total): descriptor eviction/update, unaligned prefix release, media tails, partial I/O, sorted-run boundaries (1 / 4,096 / 4,097 / 10,003 entries), ties/fractions, short reads, open/write/read/truncate/close errors and cleanup, all seven store-method failures, sort backpressure/cancellation, track imbalance, complete byte parity, B frames, zero durations, negative initial times, seeks, >4 GiB MDAT / 64-bit track bases, ESM and both CommonJS bundles. Existing tests exercise the new production store while the earlier optional media-store path remains covered.
- Isolated GC-enabled Node processes append, sort and emit a 20,000 / 400,000-sample GOP with descending/repeated PTS and varying sample sizes/durations. Retained heap increments were about 0.15 / 0.18 MiB and buffers 0.11 MiB in both. The large run sampled about 0.47 MiB heap / 0.30 MiB buffers during sorting, descriptor updates, trun serialization and draining. Assertions cap absolute heap/buffers and growth between workloads. Actual store reads/writes stayed within 64 KiB. The previous payload-already-on-disk path retained about 58 MiB heap for the same 400,000-sample workload; the comparison keeps the earlier media spool enabled. These are incremental output-store measurements, excluding source media, warm-up caches and process peaks.
- The packaged production Worker ran at the loaded Chromium extension origin on real twelve-second H.264/B-frame video plus shorter audio, and on three synthetic 10,003-sample GOPs that require external merges. Output completed; all eight sample/media/sort files were truncated to zero and handles closed. HTTP Worker instrumentation observed eight opens/eight closes, 21 sort writes and maximum read/write pages of 64 KiB. Injected descriptor quota failure preserved `QuotaExceededError` and closed all handles. Terminating a blocked merge-sort write required one job-directory removal retry; no temporary jobs remained.
- Node/Python tests, format, lint, types, Chromium/Firefox builds, frozen-lockfile install and diff checks passed. Native playback again stayed in loading state in headless Chromium, so this round confirms OPFS and automated packet/byte/seek parity, not native playback. Real Bilibili CDN, full download APIs and Firefox runtime were not exercised. Reproduction: `tests/fixtures/downloads/mp4FragmentSamplesMemory.ts`; browser artifacts remain ignored under `output/size-audit/`.

The new store bounds retained output GOP metadata, sorting and moof/trun generation; scratch disk usage and sorting/compaction I/O can grow. It uses synchronous OPFS access handles in a dedicated Worker. Individual/caller-held packets, codec/encryption data, source caches and input-side parsing of one full moof retain separate costs, so this is not a whole-task memory cap. Earlier limitations below describe their own milestones.

## Current-fragment / long-GOP media spooling: 2026-10-27

Current-fragment payloads use a separate OPFS store: append with one 64 KiB write page per track, await backpressure, then clear sample media references. Once moof offsets are known, read at most 64 KiB, flush per page, close/reset the spool. Subsequent fragments truncate/reuse the same logical file. Decode order, presentation times, durations, sync flags and fragment boundaries are unchanged.

- Added 21 regressions (262 Node tests total): real four-second single-GOP H.264/B-frame byte parity and seeking, shorter audio, spool reuse/truncation, serialized reset, append/read backpressure, write/read/reset errors, truncated pages, append/read cancellation, large backing views and all module entrypoints. A virtual >4 GiB MDAT checks extended sizes and absolute TFHD bases for a later track beyond signed run-offset range without allocating multi-gigabyte media. Existing shared-adapter partial-I/O tests also pass.
- GC-enabled isolated Node processes feed an uninterrupted GOP with fresh 32 KiB buffers. At 2,048 / 8,192 samples (about 64 / 256 MiB), retained media buffers stayed below 0.1 MiB and sampled buffers during writing/draining were about 0.9 / 1.0 MiB. The earlier path retained about 256 MiB for 8,192 samples. The large run persisted 256 MiB before finalization; media pages stayed within 64 KiB and target writes within 1 MiB. Tests cap absolute payload buffers and workload growth, including finalization. A separate case uses small views of fresh 8 MiB backing buffers to detect retained old input allocations.
- Chromium ran the packaged Worker from the loaded extension origin: twelve-second single-GOP and three-GOP videos, each with shorter audio, completed OPFS output. Video spools were 487,961 / 160,188 bytes; the latter contains only the final GOP. Index counts matched one / three fragments. Instrumented HTTP Workers confirmed 64 KiB media read/write limits and four track-file commits in the three-GOP DASH case. Injected quota errors preserved `QuotaExceededError`; terminating a blocked media write required one removal retry. No job directories remained.
- Native playback did not finish loading in headless Chromium, so this round confirms OPFS behavior and automated packet/byte/seek parity, not native playback. Full download APIs, real Bilibili CDN and Firefox runtime were not exercised. Node/Python tests, format, lint, types, both builds, frozen-lockfile installation and diff checks passed. Memory reproduction is `tests/fixtures/downloads/mp4FragmentMediaMemory.ts`; browser artifacts are ignored under `output/size-audit/`.

GOP sample/timestamp metadata, sorting and moof/trun trees still grow with sample count. Individual queued/caller-held packets may pin backing buffers. Results isolate media payload retention, not constant heap or process peaks. Spooling adds disk I/O and temporary fragment space; quota estimates remain advisory. Progressive FFmpeg processing is unchanged. Earlier milestone limitations below describe their respective stages.

## Output fMP4 index spooling: 2026-10-27

The application always supplies a disk-backed TFRA store. Every completed fragment appends a packed 28-byte record per indexed track, awaits backpressure, then releases its chunk/samples. One 64 KiB write page per track and scalar counts replace retained fragment arrays. Finalization commits the temporary files and streams MFRA headers, TFRA pages (at most 64 KiB) and MFRO, flushing each page. No full index tree or buffer is built. Temporary disk use grows with entries; the MFRO 32-bit enclosing-size limit is checked.

- Added 21 tests (241 Node tests total): byte-for-byte parity with the earlier muxer across page boundaries and early track endings, packet seeking, 64-bit timestamps and sparse output offsets above 4 GiB, both CommonJS entrypoints, partial reads/writes, write backpressure, quota/read/seal errors, truncated pages, cancellation during finalization, handle disposal, job-directory cleanup and transient OPFS locks.
- Separate GC-enabled Node processes discard written media and use actual disk spools. At 2,000 / 100,000 fragments, retained heap was about 0.7 / 1.7 MiB; buffers stayed about 1.1 MiB. At 100,000, sampled finalization heap stayed about 1.7 MiB and buffers about 1.2 MiB. Tests cap absolute retained heap/buffers and growth between workloads, including finalization reads.
- The earlier no-store path retained about 40 MiB heap at 100,000 fragments. The new path persisted 2,752,512 bytes before finalization and finished with 2,800,000 disk bytes, 43 bounded reads and a 2,800,048-byte MFRA. Output writes stayed at or below 1 MiB. These measurements isolate indexing, exclude media buffers and process peaks, and do not guarantee whole-task memory.
- The built production Worker ran from the loaded Chromium extension origin. Real short DASH inputs produced both track indexes; a 5,000-fragment AAC input produced a 140,000-byte OPFS spool and 140,048-byte final MFRA. Terminating a Worker with an open index required one cleanup retry; all job directories were removed. Native playback stayed pending in this headless session, including for the original fixture, so this round confirms OPFS/index behavior and automated packet/seek parity, not browser playback. The full download API, real Bilibili CDN and Firefox runtime were not exercised.
- Node/Python tests, formatting, lint, types, Chromium/Firefox builds, frozen-lockfile installation and diff checks passed. Memory reproduction is `tests/fixtures/downloads/mp4OutputIndexMemory.ts`; browser artifacts are ignored under `output/size-audit/`.

Current-fragment/GOP media, codec/encryption state and source caches retain their own costs. Progressive inputs still use FFmpeg and are outside this Mediabunny output-index change. Earlier milestone limitations below describe those stages.

## Bounded fragmented MP4 lookup indexes: 2026-10-27

Fragmented inputs traverse `mfra` by file range, keep TFRA descriptors, and cache at most four copied 16 KiB TFRA pages per track. First index use validates ordering in a streaming pass; ordered indexes use binary lookup, and unordered indexes use streaming fallback without a sorted copy. Per-track seek hints and cumulative decode anchors each retain at most 128 records; the shared fragment-summary cache retains 128 records. Seek hints, anchors, raw pages and summaries reuse recent accesses before eviction.

- Twenty-five new regressions brought the Node suite to 220 tests. Coverage includes both TFRA versions, all 1/2/3/4-byte reference widths, page boundaries, offsets beyond 4 GiB, skipped 8 MiB index padding, multiple runs, referenced samples inside later runs, B frames/composition offsets, key/next-key lookup, tracks ending early, concurrent tracks, caller-held old packets, init-only/fragment-only inputs, unordered/duplicate/invalid references, faulty-hint backoff, truncated/unsafe fields, I/O retries, cancellation, and eviction/reread. Nearby backward seeks must reuse the newly visited hint instead of rescanning the prefix. Both CommonJS entrypoints and ESM execute real parsing.
- Isolated Node processes generate input fragments/index entries on demand and disable read logging. With and without TFRA, they read all packets for 2,000 / 40,000 fragments, then seek backward and forward after eviction. Assertions bound retained heap (4 MiB), buffers (1 MiB), and growth between sizes (2 MiB / 512 KiB). At 40,000 fragments, observed retained heap is about 1–3 MiB and buffers about 0.13–0.20 MiB.
- The previous implementation retained about 19 MiB with TFRA and 15 MiB without TFRA for the same 40,000-fragment workload, failing the new heap assertion. Its parser/source request-size assertions alone were relaxed to permit the old whole-`mfra` read. A separate regression returns TFRA pages as views into 8 MiB Node Buffers; cached pages must copy bytes and retain less than 1 MiB of buffers, rather than pinning large backing stores.
- Missing `tfdt` uses an exact TFRA sample/run reference or rebuilds contiguous decode time from a retained anchor/init boundary. Decode end is distinct from presentation end, so eviction does not shift B-frame or composition-offset timelines. Parsing, time recovery and publication share a lock; failures do not publish a partial fragment.
- Local HTTP and an isolated loaded Chromium extension ran the production Worker on real encoded AAC/video clips repeated into 200 fragments per track, with 8 MiB `mfra` padding per input. AAC and DASH outputs completed in OPFS and played after seeks near one second and near 400 seconds. Video decoded without media errors. The instrumented HTTP Worker recorded maximum Blob reads of 192 KiB; extension-origin checks directly used its packaged Worker. This did not exercise the complete runner/download API or a real Bilibili CDN. Firefox remains build-only.
- All 220 Node tests, 38 Python tests, formatting, lint, typecheck, both production builds, frozen-lockfile installation and diff checks passed. Memory support is `tests/fixtures/downloads/mp4FragmentMemory.ts`; ignored logs, comparison scripts, real repeated media and browser results are under `output/size-audit/`.

These bounds cover retained input lookup indexes, independently of fragment count. First-use validation and unordered lookup still scan index entries; eviction can require additional index I/O or a prefix rescan. A single `moof` and its samples are parsed together, caller-held packets can retain their fragment, output indexes still grow with fragments, and codec/encryption metadata have separate costs. These measurements exclude source media and do not promise constant whole-task or peak memory.

## On-demand ordinary MP4 sample tables: 2026-10-27

Building on paged `moov` parsing, eight ordinary MP4 tables remain in the source. Each track retains at most eight 16 KiB raw pages, up to 128 prefix checkpoints and 256 decoded records each for `stts` / `ctts` / `stsc`, plus small sequential cursors. Full sample-size, chunk-offset, sync-sample, cumulative-size, and presentation-sorted arrays were removed. First access scans run tables for checkpoints; entries page on demand and can be reread after eviction. PCM groups chunks on demand.

- Fifteen new regressions brought Node tests to 195. Coverage includes page boundaries, signed CTTS, large positive offsets, reordered/repeated timestamps, keyframe seek, four size encodings, variable sizes within large chunks, PCM grouping, lazy reads, eviction/reread, I/O retries, truncated counts, and corrupt/unsafe fields. Existing concurrent-track, cancellation, 64-bit-offset, real-remux, and both CommonJS-entry tests passed.
- Separate Node processes used fixed input, disabled read logging, GC, and event-loop turns before both measurements; each performed 256 scattered seeks and 2,048 sequential accesses. Retained JS heap for 20,000 / 400,000 samples was about 1.71 / 1.74 MiB, and buffer growth 0.28 / 0.27 MiB. Regressions bound absolute values and growth for both heap and buffers, preventing replacement with linear typed arrays.
- The previous parser retained about 106 MiB heap for the same 400,000-sample workload and failed the new memory assertion. Only its old 64 KiB page assertion was relaxed for comparison, without changing parsing. Measurements isolate retained input-parser memory, exclude source media, and do not represent process peaks or full-task memory.
- Chromium ran the production Worker with real AAC / DASH containing 8 MiB `moov` padding. Both remuxed to OPFS, with maximum Blob reads still 128 KiB. Outputs played and sought past one second; DASH decoded 42 frames without media errors. This invoked the Worker from local HTTP, without the full runner, real CDN, or Firefox runtime.
- Formatting, lint, types, both builds, frozen-lockfile install, and diff checks passed. Reproduction artifacts are ignored under `output/size-audit/`; the memory fixture is `tests/fixtures/downloads/mp4TableMemory.ts`.

Retained ordinary-table indexes no longer grow linearly with samples. Initialization still scales with run entries; random access may rescan checkpoints, and wide CTTS ranges increase candidates. Output/input fragment indexes, encryption metadata, codec/metadata leaf boxes, and current GOP media retain other memory costs. Whole-task constant memory is not promised.

## Paged input MP4 indexes: 2026-10-27

The first pinned Mediabunny patch stopped reading/retaining raw `moov` wholesale: box traversal and lazy sample tables used parser requests of at most 64 KiB. Sources can coalesce/prefetch, and other codec/tag leaf boxes still read per box. At this stage decoded tables still grew with sample count; the next optimization is above.

- Thirteen tests cover all eight tables across pages, fixed `stsz`, 4/8/16-bit `stz2` including odd counts, `co64`, packet bytes/timestamps, forward/backward seek, concurrent tracks/shared initialization, corrupt tables, I/O retry, and cancellation. ESM and Node/browser CommonJS entries execute actual parsing.
- A sparse source places a 5 GiB extended-size padding box inside `moov`, with indexes/media after 4 GiB. Without allocating the full file, assertions require parser requests at most 64 KiB, actual source reads at most 256 KiB, and skipped padding.
- Production `remuxMedia` processes a real Blob with 8 MiB padding, records `Blob.slice`, bounds each read to 256 KiB, and completes audio output. These are regression bounds, not universal I/O/memory limits.
- Isolated Chromium ran the built production Worker for valid AAC/DASH with 8 MiB padding. OPFS outputs played and sought past one second, DASH decoded 42 frames, and maximum recorded Blob read was 128 KiB without media errors. Local HTTP invocation did not cover the full runner or real CDN.
- All 180 Node tests, formatting, lint, types, and both production builds passed. Firefox runtime was untested.

## Large-file flow and index memory: 2026-10-27

Valid Range resume no longer stops after 32 requests per URL. Usage polling reads committed manifests while recovery still checks every chunk. Worker startup retains a 120-second handshake timeout; afterward no byte-progress or fixed 30-minute FFmpeg limit applies. Pause/cancel still terminates the Worker.

- Eight regressions cover 99 consecutive valid ranges, no-progress responses, usage without media-file reads plus corrupt-cache rejection on reuse, startup failure, long quiet parsing/finalization, cancellation, multi-fragment keyframes/random access, and long-audio retained heap. Real WASM tests also check disabled fixed timeout, packet timestamps, and track offsets.
- DASH/AAC output uses fMP4 with minimum two-second fragments. The pinned patch releases written-fragment samples except the first sync entry/original index needed by `tfra`, fixing multi-keyframe flag compression. Progressive also fragments and preserves AAC/video offsets with `delay_moov`.
- Separate Node processes with forced GC discard written media. For 500,000 AAC packets (about three logical hours / 90 MiB output), retained heap fell from about 76 MiB with ordinary MP4 to about 2 MiB. The regression ceiling is 16 MiB for runtime variance. This isolates output indexing; it is not full-task memory or an actual three-hour transfer.
- In isolated Chromium production, a simulated CDN interrupted once and then served 46 valid ranges. Real runner/cache/Worker/downloads saved an approximately 12-second DASH file; standalone M4A and two FLV segments also saved. Metadata/CDN content were fixtures, not Bilibili downloads.
- All three outputs played in Chromium and resumed after forward/backward seeks; videos decoded without media errors. Packet tests additionally verify encoded bytes, B-frame decode order, keyframes, offsets, and cross-fragment lookup.
- Formatting, lint, types, both builds, frozen install, and diff checks passed. Scripts/files/logs are ignored in `output/size-audit/`. Firefox remained build-only.

At this milestone, output indexes still grew with fragments, ordinary-MP4 decoded tables and long-GOP buffering remained, and WASM needed working memory. Some older players/editors have lower fMP4 compatibility. No full transfer/remux above 16 GiB was performed.

## Dynamic quota and compressed manifests: 2026-10-27

The fixed 16 GiB input limit was removed. Capacity now uses missing input + approximately 105% output + 64 MiB margin, based on server lengths/actual growth; bitrate only drives progress. Quota is estimated and excludes final download-directory space.

- With 100 GiB available, budgeting permits 20 GiB input. Tests cover shrinking/growing space, unknown lengths, cached-input accounting, completed-track output, unavailable quota APIs, and a fresh pre-remux check.
- Manifest v2 replaces per-chunk array entries with consecutive-size counts. Shared small Blobs construct logical cache above 16 GiB to test load/append/completion/file references/compact metadata, without physically writing/remuxing that much media. v1 preserves its prefix and commits as v2.
- Real Chromium production downloaded a valid 64 MiB MP4 (small media plus padding). Simulated quota shrank from 1 GiB to 1 KiB; input stopped at 8 MiB, explicitly failed, preserved a v2 prefix, and created no final download.
- Restoring real quota and retrying used strong ETag/Range from cached bytes, then real remux/save. Only quota decisions were mocked; OPFS, messaging, resume, Worker, and downloads ran real code.
- The cache panel shows available-quota estimates and explains input/output space. Firefox was build-only. Real long CDN transfers and complete downloads/remux above 16 GiB remain untested.

## Progressive disk remuxing: 2026-10-27

Legacy FFmpeg output moved to synchronous OPFS files after DASH/AAC disk output, removing the 512 MiB branch. Bundled FFmpeg still parses/concatenates segments; FLV/timestamp logic was not reimplemented.

- Chromium production streamed two FLV segments from local HTTP: 1,450,828,932 input bytes (about 1.35 GiB), saved through WORKERFS/WASM/synchronous disk as 1,450,825,099-byte MP4. Queue/downloads completed with `video/mp4` and `.mp4`.
- `ffprobe` confirmed 360 H.264 frames and AAC, about 12.06 seconds. Local FFmpeg only generated/inspected fixtures. Frame-by-frame decoding matched the original 180-frame sequence repeated twice, with no missing/reordered frames or quality change.
- Cancelling around 91% remux terminated the synchronous-disk Worker, kept cancellation, cleared OPFS input/output, and leaked no file locks.
- Seven real WASM tests cover FLV/MP4 concatenation, encoded images/AAC bytes, segment offsets, silent video, corrupt media, quota errors, sparse seeks beyond 4 GiB, short writes, and truncation. Seek tests confirm MEMFS does not allocate media content.
- The then-current 16 GiB guard was not a 16 GiB test claim. WASM working memory/indexes remain; long real-CDN transfer and Firefox runtime were untested.

## Browser disk remuxing: 2026-10-27

Isolated Chrome for Testing 156 loaded the production extension. Playback metadata was fixed and media forwarded to a local streaming HTTP server. Runner, OPFS, Worker, downloads, and file saving were real. No native helper processed downloads; local FFmpeg only generated/inspected fixtures.

- Random-noise H.264 plus AAC totaled 998,260,771 input bytes (about 952 MiB); MP4 output was 998,259,482 bytes. Task/download both completed with `.mp4` and `video/mp4`.
- `ffprobe` confirmed eight-second H.264 and 1.8-second AAC, retaining individual track durations. Video SHA-256 matched before/after remuxing.
- Cancelling after 91% kept `cancelled`, created no new download, and left no OPFS input/output.
- Standalone AAC saved as `.m4a` with explicit M4A MIME, preventing Chromium's `audio/mp4` video classification from changing the suffix.
- Packet regressions compare B-frame order, timestamps, durations, and every encoded byte, plus AAC-only, missing tracks, disk failure, cancellation, quota, save-lifetime, and MIME.
- Cleanup removes abandoned `merged-output`. At that milestone disk output still had the 16 GiB guard, without a full-size test; real-CDN long transfers and Firefox runtime were untested.

## Review fixes: 2026-10-13

Fixed native `undefined` progress overwriting required fields, compressed-wire versus decoded-length confusion, settings/help navigation interrupting downloads, and retired native sessions retaining listeners/manifests. Three regressions brought JS/TS to 121; 38 Python tests, formatting, ESLint, types, both builds, and diff checks passed.

- Structured-clone tests retain explicit `undefined`: merge/save progress cannot erase received bytes, completed queues still parse, and invalid progress leaves tasks unchanged.
- A local server returns real gzip to test decoded reads, small compressed-overhead handling, and decoded-byte budgets.
- Chromium production opens settings/help in new tabs and does not reload when clicking the current download-center title. Native/queued tasks keep state.
- Thirty unstarted historical tasks add no listeners. Native tasks survive filter hiding/showing without duplicate listeners; completion while hidden retires the session. Cancel/failure/permission denial/history cleanup leave no listeners.

Native integration tests mocked permission decisions, Native Port, and metadata while using real UI/background/storage. They neither connected an installed host nor saved native files. Ignored artifacts under `output/playwright/`: `review-fixes-setup.js`, `review-fixes-check.js`, `review-fixes-resume.js`, `review-fixes-running.png`.

Fresh isolated Firefox still failed at startup with `Could not find profile folder.` before extension loading. Build success and structured-clone regressions do not replace runtime acceptance.

## Initial Chromium browser verification

A separate Chrome for Testing profile loaded production output. Pages/API metadata were fixtures; CDN responses were local two-second H.264/AAC. FFmpeg/WASM, messaging, persistence, and downloads ran real code rather than faking success.

Verified:

- Single-video MP4 saves without a scope picker.
- URL `p=2` selects P2; all-parts creates P1/P2/P3 files in order.
- Duplicate simultaneous submissions create one task; the second adds zero.
- Cancellation followed by immediate retry completes with a fresh `runId`.
- `history.pushState` to P3 updates the button with exactly one panel.
- A second download center recognizes the existing executor and does not duplicate work.
- Popup reads the active video and matches single-video page behavior.
- Closing the center marks processing/waiting work interrupted.
- `ffprobe` confirms two-second H.264/AAC output.

Browser testing found two issues invisible to builds: WXT `autoMount` needs an anchor selector, and Navigation API events precede `window.location` updates, requiring event `newUrl`.

Ignored screenshots: `output/playwright/single-video.png`, `popup-single.png`, `multipart-current.png`, `multipart-all.png`, `download-center.png`. Fixture titles are not evidence of real Bilibili downloads.

## Real API check

Direct anonymous `getVideoInfo` / `getVideoMedia` calls parsed 23 parts and two DASH tracks, selected actual returned 480P, and obtained three primary/backup URLs per track.

This checks metadata, WBI, parsing, and selection without user cookies. It does not verify authenticated premium quality. Site layouts, account states, and long real-CDN transfers still require everyday validation.

## Firefox verification limits

Production builds passed. `web-ext lint` reported zero errors/seven warnings from bundled dynamic imports, Function constructors, and Vue DOM operations; this is not store approval.

Local Firefox could not start: headed runs hit macOS sandbox/GPU-helper errors and headless runs could not find profiles. Injection, Referer, WASM, and saving **have not completed runtime verification**. Temporarily load `dist/firefox-mv3/manifest.json` at `about:debugging#/runtime/this-firefox` and repeat Chromium scenarios. Declared minimum version is Firefox 142.

## Initial-stage limits

These are historical limits, superseded where indicated at the top of this page:

- Keep the download center open; the initial version lacked resume.
- Initially each part had a 512 MB combined-input cap, with peak memory above input size.
- Quality depends on account/server streams; equal resolution/frame rate prefers SDR, equal quality prefers AVC.
- Live streams, bangumi, interactive videos, previews, and DRM were unsupported.

## P0 expansion verification

Eight new tests brought the same-day total to 21, covering complete custom-page validation, source order, duplicates, old-task migration, partial settings updates, pause scheduling, retry capacity/state reset, quality caps, portrait video, and progressive fallback.

A fresh isolated Chromium production profile verified:

- Current P2 initially selects P2 in custom mode; inversion queues P1/P3 in order.
- Select-all, uncheck, and clear work; empty selections disable submission; background rejects P99.
- Queued 720P tasks retain/select 720P after defaults change to 480P. Popup 1080P changes synchronize to the page and survive refresh.
- Pausing before enqueue keeps tasks queued across refresh. Pausing during transfer lets current saving finish while the next stays queued; resume completes both.
- Two outputs contain H.264/AAC and last two seconds.
- `p3` search and failure filters show matching tasks only.
- Three constructed failures including a repeated part plus a cancelled record bulk-retry as two unique parts; cancellation and duplicate history remain, with old run state cleared.
- Single videos hide scope, multi-part popup/page share it, and 380px popup / 390px download center have no horizontal overflow. Usage content was checked.

Metadata/playback were mocked. 1080P/720P/480P URLs returned the same small clip to verify selection/propagation, not actual resolution. No authenticated permissions or real-CDN checks were performed. Ignored `output/playwright/` artifacts include `extensions-custom-parts.png`, `extensions-popup.png`, `extensions-single.png`, `extensions-paused-search.png`, `extensions-failed-filter.png`, `extensions-queue-mobile.png`, and `extensions-options.png`.

## P1 assets and file organization

Eleven new tests brought the total to 32. They cover AAC selection, subtitle language/human-auto ordering, SRT millisecond carry and invalid times, image signatures, asset identities/migration, file snapshots, traversal/reserved names/extensions, export allowlists, and CSV formula escaping. Formatting, lint, types, and both builds passed.

Isolated Chromium with mocked APIs and real local two-second media verified:

- MP4/M4A/SRT/XML for three parts plus one cover create 13 independent tasks; cover deduplicates. All save through the real browser.
- M4A contains only AAC; MP4 retains H.264/AAC. PNG matches response bytes; SRT has correct timing/Chinese; XML retains danmaku.
- Invalid templates disable save. Queued tasks retain creator/video folders and templates after defaults reset.
- Audio-filtered JSON/CSV exports contain three records with expected fields/columns/encoding.
- HTML covers, login-required subtitles, and empty danmaku fail explicitly without fake files; restored responses permit bulk retry.
- Cancelling before cover response creates no browser download ID; retry saves.
- 390px center and 380px subtitle popup do not overflow. Directory settings synchronize and persist.
- Mock permission denial leaves notifications disabled. Mock notification APIs fire once after actual task/download completion, without duplicates. **Native permission prompts and desktop notification display were not verified.**

Playwright redirected files to temporary storage, so this checks snapshots/requested relative paths rather than actual user folders or duplicate suffixes. Asset APIs were simulated, without real-account subtitle permissions or danmaku completeness. Firefox again failed before extension loading with `Could not find profile folder`; build-only.

Ignored artifacts under `output/playwright/`: `p1-cover-panel.png`, `p1-queue.png`, `p1-queue-mobile.png`, `p1-failures.png`, `p1-popup-subtitle.png`, `p1-options.png`, plus `p1-video-*`, `p1-audio-*`, `p1-subtitle-*`, `p1-danmaku-*`, `p1-cover-*`, and `p1-history.*` outputs.

## P2 batch sources: 2026-10-05

Twenty-one tests brought the total to 53, covering links/IDs, schemes/hosts, parts/line errors, pagination schemas, duplicate/empty pages, unavailable items, WBI, business/HTTP/non-JSON errors, success skips, type/language identities, capacity, and per-video atomic enqueue. Static checks, both builds, and diff checks passed without new permissions/dependencies.

Fresh isolated Chromium with mocked list/metadata/playback APIs and real two-second media verified:

- Links retain `p=2`, report invalid lines, deduplicate, and continue after invalid videos/P99.
- Favorites deduplicate across pages, continue after unavailable-only pages, stop repeated pages, and report empty/login errors.
- Collections/series use distinct pagination; uploads use WBI. Hidden collection items skip while later pages remain readable. These successes used fixtures.
- Stopped/stale responses cannot replace new previews; changed input disables enqueue until re-preview, including invalid replacements.
- All-parts preserves order and aliases deduplicate. Active tasks always skip; success skips default on and can be disabled. Success records were constructed in isolated storage.
- Mid-import changes to default quality/templates/folders do not alter batch snapshots. Five metadata calls had four gaps of 1010–1012 ms, satisfying local one-second throttling.
- Stop completes the current video's parts and retains later selection. `-352` stops further calls; background rejects batch requests outside download-center pages.
- Closing the initiating tab prevents in-flight or throttle-waiting metadata from enqueueing/continuing; other centers remain usable.
- Real runner/WASM/downloads save a 22,110-byte, two-second H.264/AAC MP4 with completed task/download states.
- 1280px desktop and 390px mobile layouts have no horizontal overflow.

Fixtures verify behavior, not actual account access, and quality labels return the same two-second clip. Real saving reused the existing chain without altering user history/profile.

### Anonymous real APIs

`getBatchPage` used no cookies, the extension-equivalent Referer, and at least one second between calls, stopping on anti-abuse without retry:

| Source                               | Result                                                       |
| ------------------------------------ | ------------------------------------------------------------ |
| Favorites `1103407912`               | Parsed a real empty list                                     |
| Series UID `1958703906`, ID `547718` | Parsed 30 first-page items, total 564, next page 2           |
| Uploads UID `3985676`                | Preserved `-352` and stopped; real success unverified        |
| Collections                          | Research spot-check returned `-352`; no real successful read |

Source contracts reference the [upstream yt-dlp extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/bilibili.py). Internal APIs have no relied-upon stability/rate promise. One second is a local conservative policy, not protection from anti-abuse. Authenticated private favorites and successful collection/upload reads remain to verify.

Firefox again failed at startup before loading; build-only. Ignored `output/playwright/` scripts/screenshots include `p2-fixture.js`, `p2-links-check.js`, `p2-sources-check.js`, `p2-enqueue-check.js`, `p2-save-check.js`, `p2-visual-check.js`, `p2-close-check.js`, `p2-links.png`, `p2-import-desktop.png`, `p2-import-mobile.png`, and saved `p2-imported.mp4`.

## P2 large tasks: 2026-10-05

### Automated checks

Seventy-seven JS/TS tests passed, including 24 additions: 20 cache/resume, three native-export, and one representation-identity test. Coverage includes ETags, Range bounds/total/length, ignored Range (`200`), `304`, `416` bounded recovery, missing lengths, truncated/oversized/compressed responses, redirects, CDN changes, signed refresh, budgets, cancellation, quota, corrupt metadata, orphan chunks, and concurrent usage/cleanup.

Twenty-five Python tests covered simulated HTTPS resume, SHA-256, forced-exit recovery, malicious manifests/paths/URLs, redirects, symbolic/hard links, duplicate names, atomic publication, unsupported publication filesystems, and cleanup failures after success. Real local FFmpeg/ffprobe covered DASH/M4A/progressive; CDN responses were mocked. See the [helper guide](../advanced/native-helper.md).

Formatting, ESLint, types, both builds, and diff checks passed. CI added native tests without new JS dependencies/permissions. Media smoke tests explicitly skip without FFmpeg/ffprobe, while other Python tests continue.

### Chromium production extension

A fresh profile with mocked APIs/CDN used real OPFS, queue messaging, WBI, FFmpeg WASM, and browser saves:

- Interrupted media committed 1466/2932 bytes. One fresh-resolution retry still failed and retained cache. After refresh, retry sent `Range: bytes=1466-` and matching `If-Range`, continuing on valid `206`.
- Actual WORKERFS/remux/save completed. `p2-cached-output.mp4` was 22,110 bytes with H.264/AAC and two-second duration; cache then cleared.
- One failed progress message did not block subsequent updates or successful completion.
- Standalone M4A/progressive MP4 also saved. Estimated-over-budget tasks failed before media transfer with native-export guidance.
- Cleanup during active work reported the lock; cancel released it and cleared task cache. Manual cleanup reached 0 B. Mock streams explicitly honored AbortSignal.
- Export from a completed task produced version 1 with both tracks, 720P, and submitted naming/folders, without cookies/runId/download ID.
- The browser-exported manifest ran through Python with the same local clip replacing CDN responses and real local FFmpeg. Its 22,109-byte MP4 differed slightly from WASM output size but matched tracks/duration.
- 1280px/390px layouts and wrapped commands/export feedback were checked without overflow.

Ignored artifacts: `output/playwright/p2-cache-check.js`, `p2-cache-formats-check.js`, `p2-progress-recovery-check.js`, `p2-cache-desktop.png`, `p2-cache-mobile.png`, and `p2-native-task.bili.json`. Simulations do not prove real ETag/Range support or GB-scale throughput/capacity.

### Limits at this stage

- Browser input still had the historical 512 MB limit and WASM output; OPFS alone did not remove remux memory limits.
- Real Windows paths, CDN resume, browser reclamation, and quota exhaustion were simulated rather than field-tested. Real large-file duration/throughput remained unverified.
- Firefox tried fresh absolute profiles under the project and `/tmp`; both exited 1 with `Could not find profile folder.` before extension runtime. Builds do not prove OPFS/WORKERFS compatibility.

## P3 sessions and long-term history: 2026-10-05

### Automated checks

Seventeen additions brought JS/TS to 94. Seven session tests cover source/pages/selection/snapshots, conflicts, replacement, lost-response receipts, retry, option/receipt protection, aliases, and UTF-8 budgets. Ten history tests cover one-time migration, completion transitions, deletion without resurrection, latest success, 5,000 / 3 MiB eviction, corruption, requeue, deduplication past 100 records, search, and safe export.

Twenty-five native tests, static checks, both builds, and diff checks passed without new dependencies/permissions. Ordinary progress does not parse/re-encode all history; migration/new completions archive it.

### Chromium production extension

An isolated profile used metadata/history fixtures with real messages, `storage.local`, UI, and record saves. New completion archival constructed `saving` tasks and used real `runner.update`; this round did not re-claim real media download coverage from P2.

- A 125-task old queue migrated all 123 successful records before pruning, without fabricating completion times or retaining execution/download IDs.
- Deleted history stayed deleted after updates/refresh; clearing the queue retained 122 remaining successes. Requeue created a fresh ID with language, 720P, template, and directories, while rejecting active duplicates.
- Real saving-to-completed updates archived time exactly once; late terminal messages did not resurrect deleted records.
- Twenty-item pages, search/type filtering, and page reset worked. JSON/CSV each exported two filtered records; 390px layout did not overflow.
- Source drafts, selection, 480P/all-parts/disabled-success-skip options, and pagination cursor survived refresh without new API reads.
- Late stopped-page responses could not overwrite saved pages/cursors. Stop-enqueue finished one video's three tasks; refresh kept one receipt/two pending videos, locked options, and manual continue added only six remaining tasks.
- Changed-source previews remained stale across refresh; re-preview created a new session/unlocked options. Narrow batch layout did not overflow.
- Two real tabs rejected stale writes. After clearing queue/history, replaying old `batch.add` with success skipping disabled returned the original receipt without new tasks/API calls. Latest-version saves could not erase receipts/change frozen options.
- Duplicate all-parts sources and av/BV aliases respected receipts even without success skipping. Independent history controlled skips; removing it allowed requeue.
- Fresh-profile final-build testing showed concise corrupt-session errors; explicit reset restored editing without affecting 100 test tasks. Valid sessions could not be reset by stale pages. Corrupt history could be cleared after UI confirmation. Final console had no errors/warnings.

Ignored `output/playwright/` artifacts: `p3-fixture.js`, `p3-library-check.js`, `p3-library-ui-check.js`, `p3-completion-check.js`, `p3-session-ui-check.js`, `p3-receipt-cas-check.js`, desktop/mobile library/session screenshots, and `p3-library.json` / `p3-library.csv`.

### Limits

- Bounded history is not a complete archive and cannot recover pre-upgrade evictions or inspect whether disk files remain.
- Source fixtures do not prove authenticated/anti-abuse/CDN behavior; previous real-API/large-task limits remain.
- Chromium ran the extension. Two fresh Firefox starts, including a precreated absolute profile, still exited 1 with the missing-profile error before loading; build-only.

## P3 task controls, P4 native integration, P5 bundles: 2026-10-05

The remaining three planned features passed 118 JS/TS tests, 38 Python tests, static checks, both builds, and diff checks. Optional `nativeMessaging` was added without runtime dependencies; registration remains user-run.

New tests cover pause/cache, rapid pause/resume run isolation, saving boundaries, late storage events, ordering, atomic bundle capacity, complete member retention, and storage budgets. Completed active-bundle members count toward 1,000 slots. New tasks reserve future progress/filename growth; complete-group eviction respects 4 MiB, preventing repeated pause on large bundles from exhausting storage.

Python protocol tests cover framing/identity, expiration refresh, disconnect/cancel, FFmpeg exit, cancellation before publication, configuration, and temporary installation paths. Real subprocess tests confirm Python exits after completion even when browser stdin remains open, fixing a daemon BufferedReader shutdown crash. Real FFmpeg/ffprobe checks still passed. Windows path/registry functions were tested without registering on a Windows host.

### Chromium runtime evidence

An isolated production extension used fixed metadata/playback/asset APIs and local two-second media:

- Selecting five types across three parts queued 13 members with one cover, shared bundle ID, video-folder snapshots, and retained queue pause.
- Individual queued pause survived refresh; resume permitted moving down, and execution followed the new order.
- All 13 assets saved through real WASM/downloads/files, showing 13/13 success and history entries. `ffprobe` confirmed H.264/AAC MP4 and AAC-only M4A, both two seconds. Quality labels tested strategy, not fixture resolution.
- Pausing transfer retained 1466/2932 video bytes while another cover completed. After refresh, resume sent the correct Range/strong If-Range and really remuxed/saved.
- Desktop bundle picker/completion and 390px center were checked without overflow.
- Native UI tests covered permission denial without queue changes, exclusive handoff, progress, hidden-row continuity, expired refresh, completion history, cancel messages, and rejected late completion. Only Native Port/permissions were mocked; UI/background/storage were real. No installed host or native file save was exercised, so this is not post-registration end-to-end proof.

Ignored `output/playwright/` artifacts include `pnext-bundle-panel.png`, `pnext-bundle-completed.png`, `pnext-mobile.png`, `pnext-bundle-setup.js`, `pnext-pause-check.js`, `pnext-native-check.js`, and `pnext-native-result.png`. Actual outputs include `pnext-video-*.mp4`, `pnext-audio-*.m4a`, `pnext-cover-1.png`, `pnext-subtitle-*.srt`, `pnext-danmaku-*.xml`, and `pnext-resumed.mp4`.

### Still requiring real environments

- Firefox again failed before loading with the missing-profile error. Runtime acceptance remains incomplete despite successful builds.
- No host was installed into the user's active browser. Registered browser/host connections, real system permission prompts, and Windows/Linux hosts remain to verify.
- Authenticated permissions, long real-CDN resume, and GB-scale disk/memory stress were not covered by those short-media/protocol simulations.
