# Privacy Policy / 隐私政策

English and 简体中文 policies for Bilibili Downloader 0.0.1.

## Bilibili Downloader Privacy Policy

Effective October 13, 2026. Applies to version 0.0.1.
Maintainer: ntnyq. Project: https://github.com/ntnyq/bilibili-downloader

### Purpose and data handled

This extension downloads user-selected Bilibili videos and related assets and manages the tasks locally. Opening the popup reads the active tab URL to identify a supported video. The download panel on Bilibili video pages parses the current video URL and requests video information. The extension does not collect a complete browsing history or continuously track activity on other sites.

Data may include video IDs, URLs, titles, covers, public creator names, parts, duration, quality, subtitles, danmaku, media content and media URLs. Batch imports process entered links/source IDs and returned item lists. Download management uses task states, progress, timestamps, filenames and relative output paths.

API requests use credentials: include, allowing the browser to attach an existing Bilibili session. The extension does not ask for passwords, read raw cookies through the cookies API, export cookies/authentication headers to the native helper or send them to the developer. Media downloads omit credentials; media URLs may contain temporary signed parameters. API responses may contain account-related fields; the code extracts fields needed for its features.

### Storage and retention

Settings, queues, batch sessions and history are kept in local extension storage. Resume fragments and validation metadata are kept in the browser's private on-device file storage for the extension. Media muxing runs locally using FFmpeg/WASM bundled with the extension. There is no developer-operated data server, analytics SDK, advertising SDK or cross-device synchronization feature.

Settings, queues and sessions remain locally until replaced, cleared or removed on uninstall. History is limited to 5,000 entries and approximately 3 MiB serialized size, with older entries evicted as needed. Cache retention depends on task cleanup, browser quotas and user actions; retention and successful resume are not guaranteed.

### Network requests and recipients

Requests go directly to www.bilibili.com, api.bilibili.com, comment.bilibili.com and relevant subdomains of bilivideo.com, bilivideo.cn, bilivideo.net, akamaized.net and hdslb.com. These services receive the URLs, parameters, network address and applicable session information needed to serve requests, under their own policies. Displaying remote covers also requests their image service. The extension sets the Bilibili Referer only for its own relevant requests.

If completion notifications are enabled, task information such as the title is sent to the local operating system notification service. Notifications are off by default.

Only when you choose and authorize the optional native-helper feature does Native Messaging transfer task metadata, media URLs, quality and output filenames to the helper installed on your computer and receive progress/results. The helper downloads from media services and saves locally. Manually exported task JSON may contain temporary signed media URLs and should be treated as a personal file. Cookies and authentication headers are not exported to the helper.

The developer does not sell user data or use it for advertising, profiling, creditworthiness or unrelated purposes. Visiting GitHub or voluntarily filing an issue is subject to GitHub's policies. Do not include cookies, private links or download records in public issues.

### Controls and deletion

You can clear tasks/history in the download center and remove cache under the cache and native-helper section. Uninstall the extension to remove all extension settings and local data. Downloaded files, exported records/task JSON and files/cache created by a separately installed native helper must be removed separately. Uninstalling the extension does not delete those ordinary files or uninstall the helper.

### Limited use and changes

Data is used only to provide the described user-facing features. Its use complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. This policy will be updated when functionality or data practices change.

### Contact

Contact the maintainer through https://github.com/ntnyq/bilibili-downloader/issues for privacy questions. This channel is public; describe the issue without including sensitive data.

---

## B 站下载器隐私政策

生效日期：2026 年 10 月 13 日。适用版本：0.0.1。
维护者：ntnyq。项目：https://github.com/ntnyq/bilibili-downloader

### 用途及处理的数据

本扩展的用途是在用户选择后下载 Bilibili 视频和配套素材，并在本机管理下载任务。打开扩展弹窗时会读取当前标签页地址以识别支持的视频；在 Bilibili 视频页显示下载面板时，会解析当前视频地址并向 Bilibili 查询视频信息。扩展不会收集完整浏览历史，也不持续跟踪其他网站的浏览活动。

扩展可能处理视频 ID、链接、标题、封面、UP 主公开名称、分 P、时长、清晰度、字幕、弹幕、媒体内容和媒体地址。批量功能还会处理用户输入的链接或来源 ID，以及来源返回的条目列表。下载管理处理任务状态、进度、时间、文件名和相对保存路径。

Bilibili 接口请求设置 credentials: include，浏览器可能自动附带你已有的 Bilibili 会话 Cookie。扩展不要求输入密码，不通过 cookies API 读取 Cookie 原文，也不把密码、Cookie 或认证请求头导出给本地助手或发送给开发者。媒体下载请求不主动附带 Cookie；媒体 URL 可能包含短期有效的签名参数。接口响应可能包含账号相关字段，代码仅提取实现功能所需的字段。

### 存储及保留

设置、队列、批量导入会话和下载历史保存在浏览器的扩展本地存储。媒体续传片段及校验元数据保存在浏览器为扩展提供的本机私有文件存储中。媒体封装使用扩展包内的 FFmpeg/WASM，在本机执行。本扩展没有由开发者运营的数据服务器、统计 SDK、广告 SDK 或跨设备数据同步功能。

队列、会话和设置按功能需要在本机保留，直到被替换、清理或卸载。下载历史最多保留 5,000 条，并受约 3 MiB 序列化大小限制，超限时会淘汰旧记录。缓存会受任务清理、浏览器配额及用户操作影响，不保证永久保留或一定能够续传。

### 网络请求及数据接收方

为执行上述功能，浏览器直接访问 www.bilibili.com、api.bilibili.com、comment.bilibili.com，以及 bilivideo.com、bilivideo.cn、bilivideo.net、akamaized.net、hdslb.com 的相关子域名。这些服务会收到完成请求所需的 URL、请求参数、网络地址及适用的会话信息；其处理规则由相应服务决定。读取封面也会向其图片服务发送请求。扩展只为自己发起的相关请求设置 Bilibili Referer。

启用完成通知后，扩展向本机操作系统通知系统提供任务标题等通知内容。通知权限默认不启用。

只有用户选择本地助手功能并授权后，扩展才通过 Native Messaging 向用户本机安装的助手发送任务元数据、媒体 URL、画质和输出文件名，接收进度及结果；助手会直接请求媒体服务并把文件保存到本机。手动导出的任务 JSON 也可能含短期有效的媒体链接，应按个人文件妥善保存。助手不接收扩展导出的 Cookie 或认证请求头。

开发者不出售用户数据，不将其用于广告、用户画像、信用评估或与下载用途无关的目的。用户主动访问 GitHub 支持页或提交 issue 时，适用 GitHub 的隐私规则；请不要在公开 issue 中提交 Cookie、私人链接或下载记录。

### 用户控制及删除

可在下载中心清理任务和下载历史，并在“缓存与本地助手”中清理缓存。要清除所有扩展设置及本地数据，可卸载扩展。已经保存到下载目录的文件、导出的记录/任务 JSON，以及独立本地助手保存的文件和缓存，需要你另行删除；卸载扩展不会删除这些普通文件或卸载助手。

### 有限使用及更新

本扩展使用的数据仅用于提供上述明确的用户功能。数据使用遵守 Chrome 网上应用店用户数据政策，包括 Limited Use（有限使用）要求。功能或数据处理方式发生变化时，本政策会随版本更新。

### 联系

隐私问题请通过项目支持入口联系维护者：https://github.com/ntnyq/bilibili-downloader/issues 。该入口公开可见，请仅描述问题，不提交敏感数据。
