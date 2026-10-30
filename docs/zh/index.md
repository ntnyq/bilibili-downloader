---
layout: home

hero:
  name: B 站下载器
  text: 把视频与素材保存到本地
  tagline: 在 B 站视频页选择画质、分 P 与素材，在下载中心管理每一次保存。
  image:
    src: /icon.png
    alt: B 站下载器
  actions:
    - theme: brand
      text: 安装与首次下载
      link: /zh/guide/getting-started
    - theme: alt
      text: 浏览功能指南
      link: /zh/guide/usage

features:
  - title: 视频与素材
    details: 选择 MP4 视频、M4A 音频、封面原图、SRT 字幕或弹幕 XML，也可组合下载。
    link: /zh/guide/assets
    linkText: 选择下载内容
  - title: 多 P 与批量导入
    details: 按原始顺序保存所选分 P，预览收藏夹、合集、系列和 UP 主投稿，再加入队列。
    link: /zh/guide/batch-downloads
    linkText: 了解批量下载
  - title: 任务与下载记录
    details: 暂停、继续、重试与调整顺序，通过文件名模板和长期记录整理下载内容。
    link: /zh/guide/downloads
    linkText: 管理下载任务
---

## 从你要做的事情开始

| 任务                         | 文档                                                 |
| ---------------------------- | ---------------------------------------------------- |
| 第一次安装插件               | [环境要求、商店与源码安装](guide/getting-started.md) |
| 下载一个视频或自选分 P       | [画质选择与任务控制](guide/downloads.md)             |
| 批量保存收藏夹或 UP 主投稿   | [来源格式、预览与会话恢复](guide/batch-downloads.md) |
| 调整保存目录或查找旧下载     | [文件名模板与长期记录](guide/files-and-history.md)   |
| 下载中断、空间不足或缺少素材 | [故障排查](help/troubleshooting.md)                  |
| 开发或贡献代码               | [开发指南](development/index.md)                     |

## 安装

[从 Chrome 应用商店安装](https://chromewebstore.google.com/detail/bilibili-downloader/jinmimeepeceajjjgmgaggabikcabkmf)，然后刷新已打开的 B 站页面。

源码构建、Firefox 临时安装与分发打包见[安装与首次下载](guide/getting-started.md)。

## 快速开始

打开 B 站普通视频，在播放器下方卡片或工具栏弹窗中选择内容、分 P 与画质，开始下载。文件默认保存到浏览器下载目录下的 `Bilibili/`。

::: warning 保持下载中心打开
关闭或刷新下载中心会中断正在处理的任务，本地助手任务也一样。可用画质取决于账号权限，暂不支持直播、番剧、互动视频和受保护内容。
:::

## 数据留在本地

无需 API 密钥或开发者运营的后端，设置、队列和历史保存在扩展本地存储，媒体在本机处理。了解[权限与数据](help/permissions.md)、[隐私政策](help/privacy-policy.md)，或使用可选的[本地 FFmpeg 助手](advanced/native-helper.md)。
