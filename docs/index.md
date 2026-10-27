---
layout: home

hero:
  name: Bilibili Downloader
  text: Your videos, saved locally.
  tagline: Download videos, audio, covers, subtitles, and danmaku from your browser.
  actions:
    - theme: brand
      text: Get started
      link: '#install'
    - theme: alt
      text: Usage guide
      link: /usage
    - theme: alt
      text: GitHub
      link: https://github.com/ntnyq/bilibili-downloader

features:
  - title: Video and companion assets
    details: Save MP4 videos, M4A audio, original covers, SRT subtitles, and danmaku XML, individually or as bundles.
  - title: Parts and batch imports
    details: Pick video parts or import links, favorites, collections, series, and creator uploads.
  - title: A download center that remembers
    details: Pause and resume tasks, manage cached media, restore batch sessions, and organize your download history.
---

## Install

Build the extension from the [source repository](https://github.com/ntnyq/bilibili-downloader) with the pnpm version pinned in `package.json`:

```sh
pnpm install
pnpm build
```

In Chrome or Edge, open the extensions page, enable **Developer mode**, choose **Load unpacked**, and select `dist/chrome-mv3/`.

For Firefox, run `pnpm build:firefox`, open `about:debugging#/runtime/this-firefox`, and load `dist/firefox-mv3/manifest.json` as a temporary add-on. Firefox 142 or later is required. Runtime verification is still pending; see the [verification records](verification.md).

## Quick start

1. Open a video on [Bilibili](https://www.bilibili.com/) and use the download card below the player, or open the extension popup.
2. Choose video, audio, another asset, or an asset bundle. For multi-part videos, select the current part, all parts, or specific parts.
3. Choose a quality preference and start downloading. Manage tasks in the download center that opens automatically.

::: tip Keep the download center open
Downloads run in that tab. Closing or refreshing it interrupts active work. Files are saved under `Bilibili/` in your browser's default download folder.
:::

Available quality depends on your account and the streams returned by Bilibili. Live streams, bangumi, interactive videos, and protected content are currently unsupported.

## Explore the documentation

- [Usage guide](usage.md): quality, task controls, batch imports, assets, filenames, and history.
- [Local helper](native-helper.md) and [native integration](native-bridge.md): optional Python and FFmpeg downloads outside browser quotas.
- [Development](development.md): setup, documentation, builds, and verification commands.
- [Privacy policy](privacy-policy.md): data use, local storage, permissions, and deletion.

Project code is licensed under [MIT](https://github.com/ntnyq/bilibili-downloader/blob/main/LICENSE). Bundled dependencies retain their own licenses, including GPL-2.0-or-later for `@ffmpeg/core` and MPL-2.0 for Mediabunny. See the [repository license notes](https://github.com/ntnyq/bilibili-downloader#license).
