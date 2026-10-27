# Local FFmpeg download helper

Date: 2026-10-05.

Browser remuxing for DASH, progressive FLV / MP4, and AAC checks input and output space against available browser quota. When a task exceeds that capacity or you prefer processing outside the browser, export a `.bili.json` for a video/audio task and use this repository's Python helper to download and remux without re-encoding. It streams directly to disk without holding the entire video in memory.

This guide describes the manual CLI flow. Export resolves media currently available to your account; standalone completion does not update the extension queue. Exporting does not mark the original task as saved and needs no `nativeMessaging` permission. For one-click handoff, progress, and URL refresh, use [native integration](native-bridge.md). Both modes share the download engine, read no browser cookies, and run no local HTTP service.

## Usage

Install Python 3.10 or later and FFmpeg. The helper uses only Python's standard library; no `pip install` is required. See [Python downloads](https://www.python.org/downloads/) and [FFmpeg downloads](https://ffmpeg.org/download.html).

Run from the repository root, replacing task and output paths:

```sh
python3 --version
ffmpeg -version
python3 scripts/native-downloader.py /path/task.bili.json --output-dir /path/downloads
```

In Windows PowerShell:

```powershell
py -3 scripts/native-downloader.py "C:\Users\you\Downloads\task.bili.json" --output-dir "D:\Downloads"
```

If FFmpeg is outside `PATH`, provide its path explicitly. Only the local command can choose the executable; task JSON cannot:

```sh
python3 scripts/native-downloader.py /path/task.bili.json --output-dir /path/downloads --ffmpeg /path/to/ffmpeg
```

Cache defaults to `.bilibili-cache` under the output directory. Use `--cache-dir /path/cache` to choose another disk. Final files go under `Bilibili/`, preserving the task's filename and directory snapshot. Existing files are never overwritten; duplicate names receive ` (1)` and subsequent suffixes. Output is first written and flushed to a random `.part` file, then atomically published. macOS / Linux output filesystems must support hard links; Windows uses a rename that does not overwrite. A forced kill can leave `.part` files, but cannot publish a partly copied MP4 / M4A.

FFmpeg uses `-c copy` for DASH video plus AAC, audio-only M4A, or ordered progressive segments. It receives helper-generated local paths and fixed arguments, never commands or extra arguments from JSON. Remuxing times out after one hour. Disk must accommodate inputs, temporary output, and the saved copy; space failures retain input cache and report an error.

## Interruptions, resume, and expired links

Press Ctrl+C to stop, then rerun the same command to retry. Cache identity includes video, CID, asset type, quality, and media identity. Changed media uses a new cache directory and cannot mix with old data.

- Each cached resource stores committed length and a SHA-256 digest. Retry verifies the entire committed prefix; missing or corrupt data restarts that resource. An uncommitted tail left by forced exit is discarded after prefix validation, resuming from the latest valid checkpoint.
- `Range` and `If-Range` require the same CDN host/resource path, strong ETag, and known total length. New signature parameters do not change the path; a changed CDN/path restarts the resource.
- A `206` must match start, end, total length, response length, and ETag. A `200` replaces the resource and is never appended to the old prefix. `416` or mismatches trigger at most one full request.
- Complete cache is revalidated using `If-None-Match` with a strong ETag. Only a `304` with the same ETag permits reuse. Missing reliable validators or changed server media force a new download.
- Missing/weak ETags, unsupported Range, corrupted cache, or changed media can require restarting. Resuming is not guaranteed for every CDN.

When links expire, export the same task again, rerun with the new `.bili.json`, and keep the same output/cache directories. The helper does not log in or refresh links automatically. Task files contain time-limited media URLs and should be treated as download links. Helper errors do not print these URLs.

Successful saving removes known input and metadata cache for the task. Failures and cancellation retain it. Forced termination can leave a `.lock` directory: confirm the helper has exited, then delete only `.lock` inside the task cache directory shown in the error and retry. Unused cache may be removed manually when all helpers have stopped; the script offers no arbitrary-directory wipe command.

Resuming follows [HTTP conditional requests and byte ranges](https://www.rfc-editor.org/rfc/rfc9110.html#name-if-range). Strong ETags rely on correct server behavior. Local SHA-256 detects disk-cache corruption and is not a server-provided content signature.

## Input and local file boundaries

Task files are limited to 1 MiB and protocol `version: 1`. The helper revalidates task identity, asset count, extension, relative path, and CDN URLs. Only HTTPS port 443 URLs on allowed CDN domains are accepted, including after redirects. Arbitrary URLs, user-supplied headers, and cookies are rejected. Each resource has a 1 TiB protective length limit and remains constrained by disk space.

Cache names are fixed by the helper. Every output path component rejects traversal, Windows reserved names, and symbolic links. Cache rejects symbolic and hard links; output publication is exclusive. A task lock rejects simultaneous runs of the same task. `--output-dir`, `--cache-dir`, and `--ffmpeg` are paths explicitly chosen in the local command.

FFmpeg disables network input protocols and restricts demuxers to MP4/MOV, FLV, and helper-generated concat lists. This reduces extra-resource access but is not an operating-system sandbox; use a maintained FFmpeg version. See [FFmpeg protocol allowlists](https://ffmpeg.org/ffmpeg-protocols.html#Protocol-Options).

## Verification

```sh
python3 -m unittest discover -s tests/native -p '*_test.py'
```

At this stage, 25 tests passed on macOS, covering invalid tasks/redirects, conditional Range, ignored Range (`200`), shifted/changed `206`, `416`, weak/missing ETags, CDN changes, complete-cache revalidation, corruption, checkpoint recovery, compressed/oversized responses, symbolic-link rejection, duplicate output protection, atomic publication interrupted during saving, and cleanup failure after successful saving.

Two integration tests generate short H.264 / AAC media with local FFmpeg, feed simulated HTTPS responses into the real helper, and use real FFmpeg for DASH / M4A / two-segment progressive remuxing. `ffprobe` confirms tracks; cleanup failure cannot undo success. These tests explicitly skip without FFmpeg or ffprobe. They do not access a real CDN or prove account access, real-CDN resume, or huge-file duration. Windows commands and path rules are designed/tested, but have not been exercised on a Windows host.

## Browser processing and native integration

The helper provides an option outside browser memory limits. OPFS and WORKERFS reduce input buffering; [WORKERFS provides read-only File / Blob access](https://emscripten.org/docs/api_reference/Filesystem-API.html#workerfs). At the original helper milestone, browser FFmpeg output still used memory; the [FFmpeg.wasm FAQ](https://ffmpegwasm.netlify.app/docs/faq/) describes WASM limits. Current browser disk-output behavior is documented in the [architecture](implementation.md#mp4-remuxing-and-resource-cleanup).

Native Messaging integration is available with optional permission, a separate registration script, and exact Chrome-origin / Firefox-ID allowlists. Browsers do not install native hosts for extensions. Development does not automatically register a host or change system registration. See [native integration](native-bridge.md) for commands and platform limits, and the [Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) and [Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) Native Messaging documentation.
