# B 站下载器

在浏览器中下载 B 站视频和配套素材。单个视频、多 P 自选，或批量导入收藏夹，都可以直接加入下载队列。

[English](README.md) · 简体中文

## 功能

- **视频与音频**：保存 MP4 视频或 M4A 音频，自动记住画质偏好。
- **配套素材**：导出封面原图、SRT 字幕和弹幕 XML，也可一次下载素材组合。
- **多 P 与批量下载**：选择当前、全部或指定分 P，支持导入视频链接、收藏夹、合集、系列和 UP 主投稿。
- **下载中心**：暂停与继续任务、调整队列顺序、搜索下载、重试失败任务，满足条件时从缓存续传。
- **文件整理**：自定义文件名与目录，按需开启完成通知，导出 JSON / CSV 下载记录。
- **下载记录**：恢复最近一次批量会话，跳过已成功下载的内容；大型任务可交给可选的本地 FFmpeg 助手。

安装、使用与开发说明见[中文文档](docs/zh/index.md)。

## 安装

使用 `package.json` 固定的 pnpm 版本，从源码构建扩展：

```sh
pnpm install
pnpm build
```

在 Chrome 或 Edge 的扩展管理页开启**开发者模式**，选择**加载已解压的扩展程序**，加载 `dist/chrome-mv3/`。

<details>
<summary>Firefox 安装方式</summary>

运行 `pnpm build:firefox`，打开 `about:debugging#/runtime/this-firefox`，将 `dist/firefox-mv3/manifest.json` 加载为临时扩展。

需要 Firefox 142 或更高版本。Firefox 运行验证尚未完成，详见[验证记录](docs/zh/verification.md)。

</details>

## 快速开始

1. 打开一个 [B 站](https://www.bilibili.com/)视频，使用播放器下方的下载卡片，或打开扩展弹窗。
2. 选择视频、音频、其他素材或素材组合。多 P 视频可选择当前分 P、全部分 P 或自选分 P。
3. 选择画质偏好并开始下载，在自动打开的下载中心管理任务。

**下载期间请保持下载中心打开。** 文件保存在浏览器默认下载目录下的 `Bilibili/` 文件夹中。

<details>
<summary>画质、暂停行为与下载限制</summary>

- 可用画质取决于 B 站账号权限和实际返回的流；设置画质上限后不会下载更高分辨率。
- 「暂停队列」会让当前任务继续完成；单个任务的「暂停」会停止该任务并保留已提交的缓存，供后续继续下载。
- 关闭或刷新下载中心会中断正在处理的任务。重新打开后可重试，是否续传取决于缓存有效性和服务器支持。
- DASH 视频、旧格式 progressive FLV/MP4 和独立 AAC 音轨均使用浏览器磁盘封装，根据剩余配额动态预留输入与输出空间，不再设固定 16 GiB 输入上限。
- 暂不支持直播、番剧、互动视频和受保护内容。

</details>

<details>
<summary>批量导入、文件设置与本地助手</summary>

在下载中心的「批量导入」中预览来源，再将所选视频加入队列。最近一次会话会自动保存，重新打开后可继续。文件设置控制新任务的命名和目录，长期下载记录可帮助跳过已下载内容。

完整操作说明见[使用指南](docs/zh/usage.md)。大型下载可参考[本地助手说明](docs/zh/native-helper.md)，也可配置[原生助手集成](docs/zh/native-bridge.md)，直接从扩展交接任务。

</details>

<details>
<summary>开发与技术文档</summary>

[开发指南](docs/zh/development.md)包含环境准备、构建和验证命令，以及架构、路线图和验证记录的入口。

</details>

## 许可证

项目代码采用 [MIT](LICENSE)。第三方依赖分别遵循各自许可证；打包的 `@ffmpeg/core` 使用 GPL-2.0-or-later，Mediabunny 使用 MPL-2.0，其许可证随扩展放在 `licenses/mediabunny.txt`，源码见 [Mediabunny 仓库](https://github.com/Vanilagy/mediabunny)。FFmpeg 参考 [FFmpeg.wasm 许可证说明](https://ffmpegwasm.netlify.app/docs/overview/#licenses)。
