---
layout: home

hero:
  name: Bilibili Downloader
  text: Save videos and assets locally.
  tagline: Choose quality, parts, and companion assets on Bilibili. Manage every save in the download center.
  image:
    src: /icon.png
    alt: Bilibili Downloader
  actions:
    - theme: brand
      text: Install & get started
      link: /guide/getting-started
    - theme: alt
      text: Explore the guides
      link: /guide/usage

features:
  - title: Video and companion assets
    details: Save MP4 video, M4A audio, original covers, SRT subtitles, or danmaku XML, individually or together.
    link: /guide/assets
    linkText: Choose your output
  - title: Parts and batch imports
    details: Keep selected parts in order. Preview favorites, collections, series, or creator uploads before queuing.
    link: /guide/batch-downloads
    linkText: Import selected videos
  - title: Tasks and download history
    details: Pause, resume, retry, and reorder tasks. Organize saved content with filename templates and history.
    link: /guide/downloads
    linkText: Manage your tasks
---

## Start with your task

| Task                                             | Documentation                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| Install the extension for the first time         | [Requirements, builds, and installation](guide/getting-started.md)  |
| Save a video or pick specific parts              | [Quality and task controls](guide/downloads.md)                     |
| Download favorites or creator uploads            | [Sources, previews, and session recovery](guide/batch-downloads.md) |
| Change filenames or find a past download         | [File templates and history](guide/files-and-history.md)            |
| Recover an interrupted download or missing asset | [Troubleshooting](help/troubleshooting.md)                          |
| Develop or contribute                            | [Development guide](development/index.md)                           |

## Install

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/bilibili-downloader/jinmimeepeceajjjgmgaggabikcabkmf), then refresh any open Bilibili pages.

For source builds, Firefox temporary installation, and distribution archives, see [installation and first download](guide/getting-started.md).

## Quick start

Open an ordinary Bilibili video. Choose content, parts, and quality in the card below the player or the toolbar popup, then start downloading. Files default to `Bilibili/` in your browser's download folder.

::: warning Keep the download center open
Closing or refreshing the center interrupts active tasks, including local-helper downloads. Available quality depends on your account. Live streams, bangumi, interactive videos, and protected content are unsupported.
:::

## Your data stays local

No API key or developer-operated backend is required. Settings, queues, and history stay in extension local storage, and media processing runs on your computer. Read about [permissions and data](help/permissions.md), the [privacy policy](help/privacy-policy.md), or the optional [local FFmpeg helper](advanced/native-helper.md).
