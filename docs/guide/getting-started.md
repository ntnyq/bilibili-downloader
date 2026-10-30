# Getting started

Install the extension and save your first video.

## Requirements

| Requirement  | Supported configuration                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| Browser      | Chrome 120+ or a compatible Edge version; Firefox 142+ build available              |
| Build tools  | Source builds only: Node.js LTS, Git, and the pnpm version pinned in `package.json` |
| Content      | Ordinary Bilibili videos accessible to your current account                         |
| Local helper | Optional; Python 3.10+ and FFmpeg, installed separately                             |

::: info Browser verification
Chromium runtime checks and Firefox builds are recorded in [verification](../development/verification.md). Firefox runtime acceptance is still incomplete.
:::

## Install

### Chrome Web Store

[Install Bilibili Downloader from the Chrome Web Store](https://chromewebstore.google.com/detail/bilibili-downloader/jinmimeepeceajjjgmgaggabikcabkmf) for Chrome 120+ and compatible Chromium browsers such as Edge.

Refresh any open Bilibili pages after installing or updating. Store installation does not require build tools; the steps below are for source builds.

### Build from source

```sh
git clone https://github.com/ntnyq/bilibili-downloader.git
cd bilibili-downloader
pnpm install
pnpm build
```

### Load a source build in Chrome or Edge

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode** and select **Load unpacked**.
3. Select the repository's `dist/chrome-mv3/` directory.
4. Refresh any Bilibili pages already open.

### Firefox

```sh
pnpm build:firefox
```

Open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `dist/firefox-mv3/manifest.json`. Temporary installation is removed when Firefox restarts.

### Distribution archives

Use `pnpm zip` or `pnpm zip:firefox` to create distributable archives in `dist/`.

### Update a source build

Update the source, install dependencies, and rebuild for the same browser. Reload the extension in the browser's extension manager, then refresh Bilibili. Disable older copies if you see duplicate download cards.

## Save your first video

1. Open an ordinary video at `https://www.bilibili.com/video/...`.
2. Use the card below the player or the toolbar popup.
3. Choose **Video**, the current part, and a quality preference.
4. Start the download and inspect its progress in the download center.
5. When saving finishes, use **Open folder** to find the file.

::: warning Keep the download center open
Downloads execute in that tab, including tasks handed to the local helper. Closing or refreshing it interrupts active work. Reopen the center and retry the original task to validate retained cache.
:::

Files default to `Bilibili/` inside your browser's download folder. Each part is a separate file. Change naming and subdirectories in [file settings](files-and-history.md).

## What can I download?

| Content                                                 | Support                                              |
| ------------------------------------------------------- | ---------------------------------------------------- |
| Ordinary single or multi-part videos                    | MP4 video; available quality depends on your account |
| Standalone AAC audio                                    | M4A, without re-encoding                             |
| Covers, subtitles, danmaku                              | Original image, SRT, XML when available              |
| Favorites, collections, series, creator uploads         | Selected ordinary videos through batch import        |
| Live streams, bangumi, interactive or protected content | Unsupported                                          |

See the [feature guide](usage.md) for your next task, or [troubleshooting](../help/troubleshooting.md) if the first download fails.
