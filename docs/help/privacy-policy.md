# Privacy Policy

Effective October 13, 2026. Applies to version 0.0.1.
Maintainer: ntnyq. Project: https://github.com/ntnyq/bilibili-downloader

## Purpose and data handled

This extension downloads user-selected Bilibili videos and related assets and manages the tasks locally. Opening the popup reads the active tab URL to identify a supported video. The download panel on Bilibili video pages parses the current video URL and requests video information. The extension does not collect a complete browsing history or continuously track activity on other sites.

Data may include video IDs, URLs, titles, covers, public creator names, parts, duration, quality, subtitles, danmaku, media content and media URLs. Batch imports process entered links/source IDs and returned item lists. Download management uses task states, progress, timestamps, filenames and relative output paths.

API requests use credentials: include, allowing the browser to attach an existing Bilibili session. The extension does not ask for passwords, read raw cookies through the cookies API, export cookies/authentication headers to the native helper or send them to the developer. Media downloads omit credentials; media URLs may contain temporary signed parameters. API responses may contain account-related fields; the code extracts fields needed for its features.

## Storage and retention

Settings, queues, batch sessions and history are kept in local extension storage. Resume fragments and validation metadata are kept in the browser's private on-device file storage for the extension. Media muxing runs locally using FFmpeg/WASM bundled with the extension. There is no developer-operated data server, analytics SDK, advertising SDK or cross-device synchronization feature.

Settings, queues and sessions remain locally until replaced, cleared or removed on uninstall. History is limited to 5,000 entries and approximately 3 MiB serialized size, with older entries evicted as needed. Cache retention depends on task cleanup, browser quotas and user actions; retention and successful resume are not guaranteed.

## Network requests and recipients

Requests go directly to www.bilibili.com, api.bilibili.com, comment.bilibili.com and relevant subdomains of bilivideo.com, bilivideo.cn, bilivideo.net, akamaized.net and hdslb.com. These services receive the URLs, parameters, network address and applicable session information needed to serve requests, under their own policies. Displaying remote covers also requests their image service. The extension sets the Bilibili Referer only for its own relevant requests.

If completion notifications are enabled, task information such as the title is sent to the local operating system notification service. Notifications are off by default.

Only when you choose and authorize the optional native-helper feature does Native Messaging transfer task metadata, media URLs, quality and output filenames to the helper installed on your computer and receive progress/results. The helper downloads from media services and saves locally. Manually exported task JSON may contain temporary signed media URLs and should be treated as a personal file. Cookies and authentication headers are not exported to the helper.

The developer does not sell user data or use it for advertising, profiling, creditworthiness or unrelated purposes. Visiting GitHub or voluntarily filing an issue is subject to GitHub's policies. Do not include cookies, private links or download records in public issues.

## Controls and deletion

You can clear tasks/history in the download center and remove cache under **下载缓存** (Download cache). Uninstall the extension to remove all extension settings and local data. Downloaded files, exported records/task JSON and files/cache created by a separately installed native helper must be removed separately. Uninstalling the extension does not delete those ordinary files or uninstall the helper.

## Limited use and changes

Data is used only to provide the described user-facing features. Its use complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. This policy will be updated when functionality or data practices change.

## Contact

Contact the maintainer through https://github.com/ntnyq/bilibili-downloader/issues for privacy questions. This channel is public; describe the issue without including sensitive data.
