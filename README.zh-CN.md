# B 站下载器

<img src="assets/images/icon.png" width="80" height="80" alt="B 站下载器图标" />

> 在浏览器中保存 B 站视频与配套素材，支持画质选择、多 P 下载和下载中心。

基于 **WXT + Vue 3 + TypeScript + Tailwind CSS + shadcn-vue** 构建。

[English](README.md) · 简体中文 · [使用文档](docs/zh/index.md)

## 📦 安装

使用 Node.js LTS 和 `package.json` 固定的 pnpm 版本，从源码构建：

```sh
git clone https://github.com/ntnyq/bilibili-downloader.git
cd bilibili-downloader
pnpm install
pnpm build
```

**Chrome 120+ / Edge**：在扩展管理页开启**开发者模式**，选择**加载已解压的扩展程序**，加载 `dist/chrome-mv3/`。
安装或更新后，刷新已打开的 B 站页面。

<details>
<summary>Firefox 安装与分发打包</summary>

**Firefox 142+**：运行 `pnpm build:firefox`，打开 `about:debugging#/runtime/this-firefox`，将 `dist/firefox-mv3/manifest.json` 加载为临时扩展。临时安装在浏览器重启后失效。Firefox 运行验证尚未完成，详见[验证记录](docs/zh/development/verification.md)。

使用 `pnpm zip` 或 `pnpm zip:firefox` 在 `dist/` 中生成分发压缩包。修改源码后需要重新构建、重新加载扩展，并刷新 B 站页面。

</details>

## ✨ 功能

- **边看边下载**：使用播放器下方的下载卡片或工具栏弹窗，选择当前、全部或指定分 P。
- **视频与音频**：按记住的画质偏好保存 MP4 视频，或将独立 AAC 音轨无损封装为 M4A。
- **配套素材**：导出封面原图、SRT 字幕和弹幕 XML，可单独下载，也可组成素材组合。
- **批量下载**：预览视频链接、收藏夹、合集、系列或 UP 主投稿，再将所选视频加入队列。
- **任务管理**：暂停与继续单个任务、调整等待顺序、搜索队列、重试失败任务；满足条件时复用缓存续传。
- **文件整理**：自定义文件名与目录，恢复最近一次批量会话，跳过成功下载的内容，导出 JSON / CSV 记录。

## 🚀 快速开始

1. 打开一个 [B 站](https://www.bilibili.com/)视频。
2. 使用播放器下方的下载卡片，或打开工具栏中的扩展弹窗。
3. 选择下载内容、分 P 和画质，开始下载。
4. 在自动打开的下载中心查看进度、管理任务。

**下载期间请保持下载中心打开**，本地助手任务也一样。文件默认保存到浏览器下载目录下的 `Bilibili/`。

<details>
<summary>画质、暂停与恢复</summary>

- 可用画质取决于 B 站账号权限和实际返回的流。画质上限不会选择更高分辨率，扩展不会绕过访问限制。
- **暂停队列**会让当前任务继续完成；任务旁的**暂停**会停止该任务并保留已提交缓存。保存阶段不能暂停。
- 关闭或刷新下载中心会中断正在处理的任务。重新打开后可重试，续传取决于缓存有效性和服务器支持。
- 音视频采用磁盘封装，按浏览器配额动态检查输入与输出空间，不设固定 16 GiB 输入上限。
- 暂不支持直播、番剧、互动视频和受保护内容。

</details>

<details>
<summary>批量导入与大型下载</summary>

在**批量导入**中预览来源，再将所选条目加入队列。在线来源逐页读取，每份预览最多 500 条，活跃任务上限为 1000 个。最近一次会话在本地保存，重新打开后需要手动继续导入。

大型下载可使用可选的 [Python / FFmpeg 助手](docs/zh/advanced/native-helper.md)：导出 `.bili.json` 任务，或配置[原生集成](docs/zh/advanced/native-bridge.md)，从扩展交接任务并显示进度。任务文件包含临时媒体地址，请勿分享。

</details>

## 📚 文档

| 我想要……                   | 阅读                                             |
| -------------------------- | ------------------------------------------------ |
| 安装并下载第一个视频       | [快速开始](docs/zh/guide/getting-started.md)     |
| 选择分 P、画质或控制任务   | [视频与任务](docs/zh/guide/downloads.md)         |
| 导入收藏夹或 UP 主投稿     | [批量下载](docs/zh/guide/batch-downloads.md)     |
| 保存音频、封面、字幕和弹幕 | [配套素材](docs/zh/guide/assets.md)              |
| 配置文件名、查找下载记录   | [文件与记录](docs/zh/guide/files-and-history.md) |
| 恢复失败的下载             | [故障排查](docs/zh/help/troubleshooting.md)      |

## 🔒 隐私与权限

无需 API 密钥或开发者运营的后端。设置、队列、批量会话和历史保存在扩展本地存储中，媒体在本机处理，请求直接发送给 B 站及其媒体服务。

API 请求由浏览器附带已有的 B 站会话，扩展不读取或导出原始 Cookie。通知与本地助手通信仅在启用时申请可选权限。

数据存储、网络请求和删除方式见[权限说明](docs/zh/help/permissions.md)与[隐私政策](docs/zh/help/privacy-policy.md)。

## 💡 故障排查

**没有下载卡片？** 加载或更新扩展后刷新视频页，也可在支持的视频地址上尝试工具栏弹窗。

**下载中断或空间不足？** 保持下载中心打开，重试原任务以校验已有缓存。清理缓存前先暂停队列并等待当前任务停止，或改用本地助手。

**缺少画质或字幕？** 检查当前 B 站会话是否有相应访问权限。恢复步骤和支持范围见[故障排查](docs/zh/help/troubleshooting.md)。

## 🛠️ 开发

<details>
<summary>开发命令与提交前检查</summary>

```sh
pnpm install
pnpm dev
pnpm dev:firefox
```

提交前运行：

```sh
pnpm test
pnpm test:native
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm build:firefox
```

TypeScript 测试使用 `node:test`、`node:assert/strict` 和 `tsx`，本地助手测试使用 Python `unittest`。手动检查受影响的浏览器上下文，并区分固定样本测试、真实下载和 Firefox 运行验证。

[开发指南](docs/zh/development/index.md)包含项目结构、文档命令、架构说明和验证记录。

</details>

## 📄 许可证

[MIT](LICENSE) License © 2026 to PRESENT [ntnyq](https://github.com/ntnyq)。

第三方依赖分别遵循各自许可证。打包的 `@ffmpeg/core` 使用 GPL-2.0-or-later，详见 [FFmpeg.wasm 许可证说明](https://ffmpegwasm.netlify.app/docs/overview/#licenses)。Mediabunny 使用 MPL-2.0，许可证位于 [public/licenses/mediabunny.txt](public/licenses/mediabunny.txt)，源码见 [Mediabunny 仓库](https://github.com/Vanilagy/mediabunny)。
