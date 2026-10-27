---
layout: home

hero:
  name: B 站下载器
  text: 视频与素材，轻松下载
  tagline: 在浏览器中下载 B 站视频、音频、封面、字幕与弹幕。
  actions:
    - theme: brand
      text: 快速开始
      link: '#安装'
    - theme: alt
      text: 使用指南
      link: /zh/usage
    - theme: alt
      text: GitHub
      link: https://github.com/ntnyq/bilibili-downloader

features:
  - title: 视频与配套素材
    details: 保存 MP4 视频、M4A 音频、封面原图、SRT 字幕与弹幕 XML，支持单独下载或素材组合。
  - title: 多 P 自选与批量导入
    details: 选择当前、全部或指定分 P，支持视频链接、收藏夹、合集、系列和 UP 主投稿。
  - title: 记得进度的下载中心
    details: 暂停与继续任务、管理媒体缓存、恢复批量会话，通过长期记录整理已下载内容。
---

## 安装

从[源码仓库](https://github.com/ntnyq/bilibili-downloader)构建扩展，使用 `package.json` 固定的 pnpm 版本：

```sh
pnpm install
pnpm build
```

在 Chrome 或 Edge 的扩展管理页开启**开发者模式**，选择**加载已解压的扩展程序**，加载 `dist/chrome-mv3/`。

Firefox 用户运行 `pnpm build:firefox`，打开 `about:debugging#/runtime/this-firefox`，将 `dist/firefox-mv3/manifest.json` 加载为临时扩展。需要 Firefox 142 或更高版本。Firefox 运行验证尚未完成，详见[验证记录](verification.md)。

## 快速开始

1. 打开一个 [B 站](https://www.bilibili.com/)视频，使用播放器下方的下载卡片，或打开扩展弹窗。
2. 选择视频、音频、其他素材或素材组合。多 P 视频可选择当前、全部或指定分 P。
3. 选择画质偏好并开始下载，在自动打开的下载中心管理任务。

::: tip 下载期间请保持下载中心打开
下载任务在该标签页执行，关闭或刷新会中断正在处理的任务。文件保存在浏览器默认下载目录下的 `Bilibili/` 文件夹中。
:::

可用画质取决于 B 站账号权限和实际返回的流。暂不支持直播、番剧、互动视频和受保护内容。

## 继续阅读

- [使用指南](usage.md)：画质、任务控制、批量导入、素材、文件设置与下载记录。
- [本地助手](native-helper.md)与[原生助手集成](native-bridge.md)：使用可选的 Python 和 FFmpeg 在浏览器外下载。
- [开发指南](development.md)：环境准备、文档站点、构建与验证命令。
- [隐私政策](privacy-policy.md)：数据用途、本地存储、权限与删除方式。

项目代码采用 [MIT](https://github.com/ntnyq/bilibili-downloader/blob/main/LICENSE)。第三方依赖分别遵循各自许可证，包括 `@ffmpeg/core` 的 GPL-2.0-or-later 和 Mediabunny 的 MPL-2.0。详见[仓库许可证说明](https://github.com/ntnyq/bilibili-downloader#license)。
