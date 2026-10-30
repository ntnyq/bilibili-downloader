# Bilibili Downloader

<img src="assets/images/icon.png" width="80" height="80" alt="Bilibili Downloader icon" />

> Save Bilibili videos and companion assets, with quality selection, multi-part downloads, and a download center.

Built with **WXT + Vue 3 + TypeScript + Tailwind CSS + shadcn-vue**.

English · [简体中文](README.zh-CN.md) · [Documentation](docs/index.md)

## 📦 Install

Build from source with Node.js LTS and the pnpm version pinned in `package.json`:

```sh
git clone https://github.com/ntnyq/bilibili-downloader.git
cd bilibili-downloader
pnpm install
pnpm build
```

For **Chrome 120+ / Edge**, enable **Developer mode** on the extensions page,
select **Load unpacked**, and choose `dist/chrome-mv3/`.
Reload any open Bilibili pages after installing or updating.

<details>
<summary>Firefox installation and distribution archives</summary>

For **Firefox 142+**, run `pnpm build:firefox`, open
`about:debugging#/runtime/this-firefox`, and load
`dist/firefox-mv3/manifest.json` as a temporary add-on. Temporary installation
is removed when Firefox restarts. Runtime verification is still pending;
see the [verification records](docs/development/verification.md).

Use `pnpm zip` or `pnpm zip:firefox` to create distributable archives in `dist/`.
After changing the source, rebuild, reload the extension, and refresh Bilibili.

</details>

## ✨ Features

- **Download where you watch** — use the card below the Bilibili player or the toolbar popup; select current, all, or specific parts.
- **Choose video or audio** — save MP4 video with a remembered quality preference, or an AAC audio track as M4A without re-encoding.
- **Save companion assets** — export original covers, SRT subtitles, and danmaku XML, individually or as an asset bundle.
- **Download in batches** — preview links, favorites, collections, series, or creator uploads, then queue selected videos.
- **Manage your tasks** — pause and resume individual tasks, reorder waiting tasks, search the queue, and retry failures with validated cache when available.
- **Keep files organized** — customize filenames and folders, restore the latest batch session, skip successful downloads, and export JSON / CSV records.

## 🚀 Quick Start

1. Open a video on [Bilibili](https://www.bilibili.com/).
2. Use the download card below the player or open the toolbar popup.
3. Choose the output, parts, and quality, then start downloading.
4. Follow progress and manage tasks in the download center that opens automatically.

**Keep the download center open while downloading**, including local-helper
tasks. Files go to `Bilibili/` in the browser's default download folder.

<details>
<summary>Quality, pausing, and recovery</summary>

- Quality depends on your Bilibili account and returned streams. A quality cap never selects a higher resolution; the extension does not bypass access restrictions.
- **Pause queue** lets the current task finish. **Pause** beside a task stops that task and retains committed cache; saving tasks cannot be paused.
- Closing or refreshing the download center interrupts active work. Reopen it and retry; resuming depends on valid cache and server support.
- Video and audio use disk-backed remuxing with dynamic browser quota checks for input and output. There is no fixed 16 GiB input cap.
- Live streams, bangumi, interactive videos, and protected content are currently unsupported.

</details>

<details>
<summary>Batch imports and large downloads</summary>

In **Batch import**, preview a source and queue selected items. Online sources
load one page at a time, with up to 500 items per preview and 1,000 active tasks.
The latest session is restored locally; continue importing manually after reopening.

For large downloads, use the optional [Python / FFmpeg helper](docs/advanced/native-helper.md).
Export a `.bili.json` task, or configure [native integration](docs/advanced/native-bridge.md)
to hand off tasks and display progress in the extension. Task files contain
temporary media URLs; keep them private.

</details>

## 📚 Documentation

| I want to…                                 | Read                                                 |
| ------------------------------------------ | ---------------------------------------------------- |
| Install and save my first video            | [Getting started](docs/guide/getting-started.md)     |
| Choose parts, quality, or task controls    | [Video and tasks](docs/guide/downloads.md)           |
| Import favorites or creator uploads        | [Batch downloads](docs/guide/batch-downloads.md)     |
| Save audio, covers, subtitles, or danmaku  | [Companion assets](docs/guide/assets.md)             |
| Configure filenames or find past downloads | [Files and history](docs/guide/files-and-history.md) |
| Recover a failed download                  | [Troubleshooting](docs/help/troubleshooting.md)      |

## 🔒 Privacy and Permissions

No API key or developer-operated backend is required. Settings, queues, batch
sessions, and history stay in local extension storage. Media processing runs on
your computer; requests go directly to Bilibili and its media services.

The browser attaches your existing Bilibili session to API requests. The
extension does not read or export raw cookies. Notifications and native-helper
communication request optional permissions only when enabled.

Read [permissions](docs/help/permissions.md) and the [privacy policy](docs/help/privacy-policy.md)
for storage, network, and deletion details.

## 💡 Troubleshooting

**Download card missing?** Reload the video page after loading or updating the
extension, or try the toolbar popup on a supported video URL.

**Download interrupted or out of space?** Keep the download center open. Retry
the original task to validate retained cache. Pause the queue and wait for the
current task to stop before clearing cache, or use the local helper.

**Quality or subtitles missing?** Check that the content is available in your
current Bilibili session. See [troubleshooting](docs/help/troubleshooting.md) for
recovery steps and supported-content limits.

## 🛠️ Development

<details>
<summary>Development commands and checks</summary>

```sh
pnpm install
pnpm dev
pnpm dev:firefox
```

Before submitting changes, run:

```sh
pnpm test
pnpm test:native
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm build:firefox
```

TypeScript tests use `node:test`, `node:assert/strict`, and `tsx`. Native helper
tests use Python `unittest`. Exercise affected browser contexts manually and
distinguish fixture-based checks from real downloads and Firefox runtime checks.

The [development guide](docs/development/index.md) covers project structure,
documentation commands, architecture, and verification records.

</details>

## 📄 License

[MIT](LICENSE) License © 2026 to PRESENT [ntnyq](https://github.com/ntnyq).

Third-party dependencies retain their own licenses. The bundled `@ffmpeg/core`
is GPL-2.0-or-later; see the [FFmpeg.wasm license notes](https://ffmpegwasm.netlify.app/docs/overview/#licenses).
Mediabunny is MPL-2.0, with its license included in
[public/licenses/mediabunny.txt](public/licenses/mediabunny.txt) and source in the
[Mediabunny repository](https://github.com/Vanilagy/mediabunny).
