# Bilibili Downloader

Download Bilibili videos and their companion assets from your browser.
Save a single video, pick parts, or queue a collection with a few clicks.

English · [简体中文](README.zh-CN.md)

## Features

- **Video and audio** — Save videos as MP4 or audio as M4A, with a remembered quality preference.
- **Companion assets** — Export original covers, SRT subtitles, and danmaku XML, individually or as an asset bundle.
- **Multi-part and batch downloads** — Select parts or import video links, favorites, collections, series, and creator uploads.
- **Download center** — Pause and resume tasks, reorder the queue, search downloads, and retry failures. Resume from cached data when supported.
- **Organized files** — Customize filenames and folders, enable completion notifications, and export download records as JSON or CSV.
- **Download history** — Restore the latest batch session and skip previously saved items. Use the optional local FFmpeg helper for larger downloads.

Read the [documentation](docs/index.md) for installation, usage, and development guides.

## Install

Build the extension from source using the pnpm version pinned in `package.json`:

```sh
pnpm install
pnpm build
```

In Chrome or Edge, open the extensions page, enable **Developer mode**, choose
**Load unpacked**, and select `dist/chrome-mv3/`.

<details>
<summary>Firefox installation</summary>

Run `pnpm build:firefox`, open `about:debugging#/runtime/this-firefox`, and load
`dist/firefox-mv3/manifest.json` as a temporary add-on.

Firefox requires version 142 or later. Runtime verification is still pending;
see the [verification notes](docs/verification.md).

</details>

## Quick start

1. Open a video on [Bilibili](https://www.bilibili.com/) and use the download card below the player, or open the extension popup.
2. Choose video, audio, another asset, or an asset bundle. For multi-part videos, select the current part, all parts, or specific parts.
3. Choose your quality preference and start the download. Manage tasks in the download center that opens automatically.

**Keep the download center open while downloading.** Files are saved under
`Bilibili/` in your browser's default download folder.

<details>
<summary>Quality, pause behavior, and download limits</summary>

- Available quality depends on your Bilibili account and the streams returned by Bilibili. A quality cap never selects a higher resolution.
- Pausing the queue lets the current task finish. Pausing an individual task stops it and retains committed cache data for resuming.
- Closing or refreshing the download center interrupts active work. Reopen it and retry; resuming depends on valid cached data and server support.
- DASH video, progressive FLV/MP4, and AAC audio use disk-backed browser remuxing. Capacity is checked dynamically against available browser quota for both input and output, with no fixed 16 GiB input cap.
- Live streams, bangumi, interactive videos, and protected content are currently unsupported.

</details>

<details>
<summary>Batch imports, file settings, and the local helper</summary>

Use **Batch import** in the download center to preview a source and queue selected
videos. The latest session is saved so you can continue after reopening.
File settings control naming and folders for newly queued tasks; download
history helps avoid saving the same content again.

For detailed instructions, see the [usage guide](docs/usage.md).
For larger downloads, see the [local helper guide](docs/native-helper.md)
or set up [native integration](docs/native-bridge.md) to hand off tasks
directly from the extension.

</details>

<details>
<summary>Development and technical documentation</summary>

See the [development guide](docs/development.md) for setup, build, and verification
commands. Architecture, roadmap, and verification records are linked there.

</details>

## License

Project code is licensed under [MIT](LICENSE). Third-party dependencies retain
their own licenses; the bundled `@ffmpeg/core` is GPL-2.0-or-later, and Mediabunny is MPL-2.0.
The Mediabunny license is included in `public/licenses/mediabunny.txt`; its source
is available in the [Mediabunny repository](https://github.com/Vanilagy/mediabunny).
See the [FFmpeg.wasm license notes](https://ffmpegwasm.netlify.app/docs/overview/#licenses).
