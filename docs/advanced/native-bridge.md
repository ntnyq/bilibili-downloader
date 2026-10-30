# Native helper integration

The download center can launch Python / FFmpeg through Native Messaging and display media transfer, remuxing, and saved results. Completed tasks enter download history; files go to the directory chosen during installation. This is an advanced optional feature; normal downloads and disk-backed remuxing of large files already run directly in the browser.

## Installation

Install Python 3.10+ and an executable FFmpeg first. The installer does not download dependencies. Run from the repository root, replacing the extension ID. Building the extension does not install the helper.

For Chrome, copy the current extension ID from developer mode at `chrome://extensions`:

```sh
python3 scripts/install-native-host.py --browser chrome --extension-id YOUR_EXTENSION_ID
```

Use `--browser chromium` for Chromium. For Firefox, use the fixed `browser_specific_settings.gecko.id` from the built manifest:

```sh
python3 scripts/install-native-host.py --browser firefox --extension-id bilibili-downloader@ntnyq
```

Check the actual built manifest; do not use Firefox's temporary web-page UUID. If reloading or renaming changes the extension ID, rerun installation to update the exact allowlist.

Output defaults to your `Downloads` directory. Choose another with `--output-dir`, or an absolute FFmpeg path with `--ffmpeg`. The installer records absolute Python and FFmpeg paths, so the browser need not inherit your terminal's PATH. Quote paths with spaces.

```sh
python3 scripts/install-native-host.py --browser chrome --extension-id YOUR_EXTENSION_ID --output-dir "$HOME/Movies" --ffmpeg /path/to/ffmpeg
```

On Windows, replace `python3` with `py -3`. The installer creates a `.cmd` launcher, enables UTF-8 and binary message streams, and registers the selected browser under the current user's `HKCU\Software\Google\Chrome\NativeMessagingHosts`, `HKCU\Software\Chromium\NativeMessagingHosts`, or `HKCU\Software\Mozilla\NativeMessagingHosts`. Administrator access is unnecessary. Windows install paths cannot contain `%`, `!`, or double quotes. Actual Windows runtime verification still requires a Windows environment.

On macOS / Linux, the manifest goes into the selected browser's per-user directory. Helper programs default to `~/.local/share/bilibili-downloader/native`; moving the source repository afterward does not affect the installation. Rerun installation to upgrade. `--install-dir` and `--manifest-dir` support customization or isolated tests; a test manifest directory is not automatically a real browser registration location.

## Usage and recovery

1. Pause a video/audio task, or choose a failed, cancelled, or completed task.
2. Open **查看详情** (View details) → **高级选项：本地助手** (Advanced: local helper), choose **交给本地助手** (Hand to local helper), and grant the optional native communication permission when prompted. Setup and usage are also under the advanced options in **下载缓存** (Download cache).
3. Keep the download center open. Filtering does not interrupt the task; closing the page stops it.
4. Inspect downloaded bytes, remuxing state, and the final path. Completed tasks also appear in history.

If signed links return 401 / 403 / 410 and alternate URLs also fail, the helper asks the browser to resolve the original task again, at most twice. Browser and helper both require unchanged video, part, quality, media identity, and output name. Resume requires valid hashes, strong ETags, resource identity, and Range responses. Quality/identity changes or repeated expiration stop the task while preserving cache. After a temporary outage, hand off the same task again; when the server cannot prove resource continuity, that resource restarts.

Explicit cancellation requests a checkpoint, stops FFmpeg, and releases the lock. Network reads may take about 30 seconds to respond. Browser crashes or forced termination can leave locks; confirm the helper and FFmpeg have exited before deleting `.lock` under the task cache directory identified in the error, then retry.

## Communication and permissions

Only extension pages with optional `nativeMessaging` permission can connect; content scripts cannot connect directly. Host manifests allow exact extension IDs without wildcards. The background validates task ID and run token on progress/completion, so cancelled runs cannot overwrite fresh state. The helper accepts no cookies, arbitrary headers, arbitrary output directories, or arbitrary FFmpeg commands, and runs no HTTP service.

Messages use stdin/stdout with a native-endian 32-bit length prefix and UTF-8 JSON, limited to 1 MiB per message. stdout carries only protocol messages; diagnostics go to stderr. Downloads retain the manual helper's HTTPS CDN, redirect, traversal, symbolic-link, cache-hash, and atomic-save validation.

See [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) and [Firefox Native Messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).

## Uninstall

Remove `com.ntnyq.bilibili_downloader.json` from the browser's per-user manifest directory and delete installed helper files. On Windows, also remove the `com.ntnyq.bilibili_downloader` key under that browser's HKCU registration. Downloaded files remain. Cache lives in `.bilibili-cache` under the chosen output directory and may be removed when no tasks are running.

Development checks: `pnpm test:native`, `pnpm test`, and `pnpm typecheck`. Protocol and installation-path tests use temporary directories and do not register with the developer's active browser.
