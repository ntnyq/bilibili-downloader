# Permissions and local data

The extension requests access needed to identify videos, fetch selected content, and save files. This page explains the manifest permissions; see the [privacy policy](privacy-policy.md) for the full data policy.

## Required browser permissions

| Permission                            | Purpose                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `storage`                             | Save settings, queue state, batch sessions, and download history locally |
| `activeTab`                           | Identify the active video from the toolbar popup                         |
| `tabs`                                | Find, open, and communicate with extension and video tabs                |
| `downloads`                           | Save generated files through the browser's download manager              |
| `declarativeNetRequestWithHostAccess` | Set the Bilibili Referer on relevant requests made by the extension      |

## Site access

| Site scope                                                                      | Purpose                                                              |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `www.bilibili.com`                                                              | Display the video-page card and read current video information       |
| `api.bilibili.com`                                                              | Request video metadata, playable streams, subtitles, and batch lists |
| `comment.bilibili.com`                                                          | Fetch danmaku                                                        |
| Subdomains of `bilivideo.com`, `bilivideo.cn`, `bilivideo.net`, `akamaized.net` | Fetch media streams                                                  |
| Subdomains of `hdslb.com`                                                       | Fetch covers and related images                                      |

API requests let the browser attach your existing Bilibili session. The extension does not request your password, read raw cookies through the cookies API, or export cookies to the helper. Media downloads omit credentials.

## Optional permissions

| Permission        | Requested when                      | Purpose                                                        |
| ----------------- | ----------------------------------- | -------------------------------------------------------------- |
| `notifications`   | You enable completion notifications | Show a system notification after saving succeeds               |
| `nativeMessaging` | You choose native helper handoff    | Communicate with the separately installed Python / FFmpeg host |

Normal browser downloads do not require either optional feature. Host installation remains a separate, user-run step; see [native integration](native-bridge.md).

## Stored data and deletion

| Data                                  | Location and removal                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Settings, queue, latest batch session | Extension local storage; clear available records in the UI or uninstall the extension     |
| Successful history                    | Local storage, up to 5,000 records / 3 MiB; remove in long-term history                   |
| Browser media cache                   | Extension-private disk storage; use cache cleanup when no task is downloading or remuxing |
| Saved files and exports               | Ordinary files; remove through your file manager                                          |
| Helper files and cache                | Separate local installation and output directory; remove separately                       |

Clearing history does not delete saved files. Clearing the queue keeps long-term history. Uninstalling the extension does not uninstall the helper or delete ordinary downloaded files.

No developer-operated server, analytics, advertising SDK, or cross-device sync is used. Temporary media URLs in exported `.bili.json` task files should remain private.
