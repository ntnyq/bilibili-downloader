<p align="center">
  <img src="assets/images/icon.png" width="80" height="80" alt="Bilibili Downloader icon" />
</p>

<h1 align="center">Bilibili Downloader</h1>

<p align="center">Save Bilibili videos and companion assets, with quality selection, multi-part downloads, and a download center.</p>

English · [简体中文](README.zh-CN.md) · [Documentation](https://bilibili-downloader.ntnyq.dev/)

Built with **WXT + Vue 3 + TypeScript + Tailwind CSS + shadcn-vue**.

## 📦 Install

<a href="https://chromewebstore.google.com/detail/bilibili-downloader/jinmimeepeceajjjgmgaggabikcabkmf">
  <img src="https://www.google.com/chrome/static/images/chrome-logo.svg" width="64" height="64" alt="Install from the Chrome Web Store" />
</a>

[**Install from the Chrome Web Store**][chrome-store]

[![Chrome Web Store version](https://img.shields.io/chrome-web-store/v/jinmimeepeceajjjgmgaggabikcabkmf?label=Chrome%20Web%20Store)][chrome-store]

For Chrome 120+ and compatible Chromium browsers such as Edge. After installing or updating, **reload any open Bilibili pages**.

For source builds, Firefox temporary installation, and distribution archives, see the [installation guide](https://bilibili-downloader.ntnyq.dev/guide/getting-started).

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

## 📚 Documentation

Visit [bilibili-downloader.ntnyq.dev](https://bilibili-downloader.ntnyq.dev/) for the full documentation.

- [Feature guide](https://bilibili-downloader.ntnyq.dev/guide/usage): quality, parts, batches, assets, and file settings.
- [Cache and large downloads](https://bilibili-downloader.ntnyq.dev/advanced/cache-storage): disk quota, recovery, and the optional local helper.
- [Troubleshooting](https://bilibili-downloader.ntnyq.dev/help/troubleshooting): interrupted downloads, missing quality, and unavailable assets.
- [Permissions](https://bilibili-downloader.ntnyq.dev/help/permissions) and [privacy policy](https://bilibili-downloader.ntnyq.dev/help/privacy-policy): local data, network requests, and deletion.
- [Development guide](https://bilibili-downloader.ntnyq.dev/development/): builds, tests, project structure, and verification records.

## 📄 License

[MIT](LICENSE) License © 2026 to PRESENT [ntnyq](https://github.com/ntnyq).

Third-party dependencies retain their own licenses. The bundled `@ffmpeg/core`
is GPL-2.0-or-later; see the [FFmpeg.wasm license notes](https://ffmpegwasm.netlify.app/docs/overview/#licenses).
Mediabunny is MPL-2.0, with its license included in
[public/licenses/mediabunny.txt](public/licenses/mediabunny.txt) and source in the
[Mediabunny repository](https://github.com/Vanilagy/mediabunny).

[chrome-store]: https://chromewebstore.google.com/detail/bilibili-downloader/jinmimeepeceajjjgmgaggabikcabkmf
