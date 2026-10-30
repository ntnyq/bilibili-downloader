# Troubleshooting

Find the symptom below. Retry the original task when possible so it can validate and reuse retained cache.

## The download card does not appear

1. Confirm that the extension is enabled and the page is an ordinary `https://www.bilibili.com/video/...` video.
2. Refresh the page after installing, updating, or reloading the extension.
3. Try the toolbar popup on that video page.
4. If the page layout changed, report the video URL and browser version without account data.

## A quality option is unavailable

The extension can only use streams returned for your current Bilibili session. Sign in on Bilibili and confirm that your account can play the desired quality. A cap such as 720P never upgrades to 1080P when no stream meets it. Changing the default only affects newly queued tasks; retry preserves the original setting.

## A download stopped after closing the tab

Reopen the download center and retry the original task. Keep the center open, including during native-helper downloads. Committed cache may survive; resume requires matching resources, strong ETags, and valid Range responses. Changed resources or unsupported ranges restart that resource safely.

## Pausing the queue did not stop a transfer

**Pause queue** stops the next task from starting. Use **Pause** beside a task to stop its parsing, transfer, or remuxing. The final saving phase cannot be paused. See [task controls](../guide/downloads.md).

## Disk space or browser quota is insufficient

Pause the queue and wait for active downloading or remuxing to stop before clearing cache under **下载缓存** (Download cache). Free disk space and retry. Remuxing requires both input and output space, and saving also creates the final download copy. Browser quota estimates differ from system free space. There is no fixed browser input size cap; if you still need storage outside browser quota, the [local helper](../advanced/native-helper.md) is available under advanced options. Browser and helper caches are separate and are not transferred during handoff.

## A saved file does not play in an older editor

Browser remuxing can produce fragmented MP4 / M4A. Some older players and editors have lower compatibility. Try a player that supports fragmented MP4, or use the [FFmpeg helper](../advanced/native-helper.md) to produce the output through native FFmpeg.

## Subtitles, danmaku, or audio are missing

The source may not provide that asset. Some subtitles require login; audio export requires a standalone AAC track. Danmaku exports the current API snapshot rather than all historical messages. Missing assets remain failed members of a bundle and can be retried independently. See [asset limits](../guide/assets.md).

## Batch import stopped or skipped videos

- Sign in and confirm access to private favorites. Resolve short links in the browser and copy the full URL.
- Load the next page manually; previews contain at most 500 items.
- Active duplicates are always skipped. Successful history is skipped by default, independently of quality; disable that option to download it again.
- Login, anti-abuse, network, or capacity errors stop import while keeping queued items. Fix the cause, then continue manually.
- If another download center changed the session, load its latest version before continuing.

See [batch downloads](../guide/batch-downloads.md) for source formats and queue limits.

## The native helper cannot connect

Confirm Python 3.10+ and FFmpeg are installed, register the correct browser with the current extension ID, and allow the optional native communication permission. Building the extension alone does not register a host. See [native integration](../advanced/native-bridge.md) for installation, recovery, and platform verification limits.

## Report a problem

[Open an issue](https://github.com/ntnyq/bilibili-downloader/issues) with the browser and extension versions, steps to reproduce, the visible error, and whether it affects browser or helper downloads. Include a public video URL only if appropriate. Remove cookies, signed CDN links, `.bili.json` contents, and private download records.

For the current test scope, see [verification records](../development/verification.md). Live streams, bangumi, interactive videos, and protected content remain unsupported.
