# 快速开始

构建扩展、加载到浏览器，然后下载第一个视频。

## 环境要求

| 项目     | 支持范围                                               |
| -------- | ------------------------------------------------------ |
| 浏览器   | Chrome 120+ 或兼容版本的 Edge；提供 Firefox 142+ 构建  |
| 构建工具 | Node.js LTS、Git，以及 `package.json` 固定的 pnpm 版本 |
| 内容     | 当前账号可访问的 B 站普通视频                          |
| 本地助手 | 可选，需另行安装 Python 3.10+ 和 FFmpeg                |

::: info 浏览器验证范围
Chromium 运行检查和 Firefox 构建结果见[验证记录](verification.md)。Firefox 运行验收尚未完成。
:::

## 安装

### 从源码构建

```sh
git clone https://github.com/ntnyq/bilibili-downloader.git
cd bilibili-downloader
pnpm install
pnpm build
```

### Chrome 与 Edge

1. 打开 `chrome://extensions` 或 `edge://extensions`。
2. 开启**开发者模式**，选择**加载已解压的扩展程序**。
3. 选择仓库中的 `dist/chrome-mv3/` 目录。
4. 刷新已经打开的 B 站页面。

### Firefox

```sh
pnpm build:firefox
```

打开 `about:debugging#/runtime/this-firefox`，选择**临时载入附加组件**，加载 `dist/firefox-mv3/manifest.json`。临时安装在 Firefox 重启后失效。

### 更新源码安装的扩展

更新源码、安装依赖，再为相同浏览器重新构建。在浏览器扩展管理页重新加载扩展，然后刷新 B 站。如果出现重复下载卡片，先停用旧副本。

## 下载第一个视频

1. 打开 `https://www.bilibili.com/video/...` 下的普通视频。
2. 使用播放器下方的下载卡片，或打开工具栏弹窗。
3. 选择「视频」、当前分 P 和画质偏好。
4. 开始下载，在下载中心查看进度。
5. 保存完成后，通过「打开文件夹」找到文件。

::: warning 下载期间保持下载中心打开
任务在这个标签页中执行，交给本地助手的任务也一样。关闭或刷新会中断正在处理的任务，重新打开后可重试原任务以校验已有缓存。
:::

文件默认保存在浏览器下载目录下的 `Bilibili/`，每个分 P 单独保存。命名和子目录可在[文件设置](files-and-history.md)中调整。

## 支持哪些内容？

| 内容                             | 支持情况                         |
| -------------------------------- | -------------------------------- |
| 普通单 P、多 P 视频              | MP4 视频，可用画质取决于账号权限 |
| 独立 AAC 音轨                    | 无损封装为 M4A                   |
| 封面、字幕、弹幕                 | 可用时导出原图、SRT、XML         |
| 收藏夹、合集、系列、UP 主投稿    | 通过批量导入下载所选普通视频     |
| 直播、番剧、互动视频和受保护内容 | 暂不支持                         |

继续查看[功能指南](usage.md)，或在下载失败时查看[故障排查](troubleshooting.md)。
