<p align="center">
  <img src="assets/images/icon.png" width="80" height="80" alt="B 站下载器图标" />
</p>

<h1 align="center">B 站下载器</h1>

<p align="center">在浏览器中保存 B 站视频与配套素材，支持画质选择、多 P 下载和下载中心。</p>

[English](README.md) · 简体中文 · [使用文档](https://bilibili-downloader.ntnyq.dev/zh/)

基于 **WXT + Vue 3 + TypeScript + Tailwind CSS + shadcn-vue** 构建。

设置页支持「跟随浏览器 / 简体中文 / English」，选择后自动保存并立即同步到已打开的扩展页面和视频页面板。
跟随浏览器时，其他语言回退到英文。

## 📦 安装

<a href="https://chromewebstore.google.com/detail/bilibili-downloader/jinmimeepeceajjjgmgaggabikcabkmf">
  <img src="https://www.google.com/chrome/static/images/chrome-logo.svg" width="64" height="64" alt="从 Chrome 应用商店安装" />
</a>

[**从 Chrome 应用商店安装**][chrome-store]

[![Chrome Web Store version](https://img.shields.io/chrome-web-store/v/jinmimeepeceajjjgmgaggabikcabkmf?label=Chrome%20Web%20Store)][chrome-store]

适用于 Chrome 120+、兼容版本的 Edge 等 Chromium 浏览器。安装或更新后，**刷新已打开的 B 站页面**。

源码构建、Firefox 临时安装与分发打包见[安装指南](https://bilibili-downloader.ntnyq.dev/zh/guide/getting-started)。

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

## 📚 文档

访问 [bilibili-downloader.ntnyq.dev](https://bilibili-downloader.ntnyq.dev/zh/) 阅读完整文档。

- [功能指南](https://bilibili-downloader.ntnyq.dev/zh/guide/usage)：画质、分 P、批量下载、素材与文件设置。
- [缓存与大型下载](https://bilibili-downloader.ntnyq.dev/zh/advanced/cache-storage)：磁盘配额、缓存恢复与可选本地助手。
- [故障排查](https://bilibili-downloader.ntnyq.dev/zh/help/troubleshooting)：下载中断、缺少画质和素材等常见问题。
- [权限说明](https://bilibili-downloader.ntnyq.dev/zh/help/permissions)与[隐私政策](https://bilibili-downloader.ntnyq.dev/zh/help/privacy-policy)：本地数据、网络请求与删除方式。
- [开发指南](https://bilibili-downloader.ntnyq.dev/zh/development/)：构建、测试、项目结构与验证记录。

## 📄 许可证

[MIT](LICENSE) License © 2026 to PRESENT [ntnyq](https://github.com/ntnyq)。

第三方依赖分别遵循各自许可证。打包的 `@ffmpeg/core` 使用 GPL-2.0-or-later，详见 [FFmpeg.wasm 许可证说明](https://ffmpegwasm.netlify.app/docs/overview/#licenses)。Mediabunny 使用 MPL-2.0，许可证位于 [public/licenses/mediabunny.txt](public/licenses/mediabunny.txt)，源码见 [Mediabunny 仓库](https://github.com/Vanilagy/mediabunny)。

[chrome-store]: https://chromewebstore.google.com/detail/bilibili-downloader/jinmimeepeceajjjgmgaggabikcabkmf
