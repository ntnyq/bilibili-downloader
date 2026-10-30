# 开发指南

## 国际化

扩展使用 `@wxt-dev/i18n` 词条和独立保存的界面语言偏好，`locales/en.yaml` 为英文回退语言，
`locales/zh_CN.yaml` 提供简体中文。界面、通知、校验提示和下载错误统一使用
`utils/i18n.ts` 导出的类型安全 `i18n`；页面入口还会初始化本地化标题和文档语言。
设置页支持跟随浏览器、简体中文和英文，切换时同步更新已打开的页面，不刷新下载任务。
运行时词条由 `wxt prepare` 从同一组 YAML 文件生成，共享标签用 getter，校验消息用回调，
以便跟随语言变化。浏览器管理的扩展名称和描述仍由浏览器语言决定。

新增文案时同步维护两个语言包，优先使用完整句子和 `$1`、`$2` 等位置占位符，
数量文案使用 WXT 的复数格式。不要使用 `$1$2` 这样的相邻占位符，Chrome 会把
`$1$` 识别为未声明的命名占位符。媒体 Worker 无法调用扩展 API，其使用的词条还需
加入 `utils/downloads/media/i18n.ts`。`pnpm test` 会检查词条一致性、浏览器占位符
语法、本地化输出和 Worker 翻译。开发模式修改 YAML 时会同时更新浏览器消息和运行时词条。
`nativeHelper` 词条组还会在扩展接收端翻译已安装助手返回的诊断，无需升级助手；
无法识别的新诊断保留原文。

[文档首页](../index.md) · [English](../../development/index.md)

扩展使用 WXT、Vue 3、TypeScript 和 Tailwind CSS 构建。使用 `package.json` 固定的 pnpm 版本。

## 本地开发

```sh
pnpm install
pnpm dev
```

Firefox 开发使用 `pnpm dev:firefox`。安装依赖时会运行 `wxt prepare`，生成扩展类型和配置。

## 构建与打包

| 命令                 | 输出                                   |
| -------------------- | -------------------------------------- |
| `pnpm build`         | Chromium 扩展，位于 `dist/chrome-mv3/` |
| `pnpm build:firefox` | Firefox 扩展，位于 `dist/firefox-mv3/` |
| `pnpm zip`           | Chromium 分发压缩包，位于 `dist/`      |
| `pnpm zip:firefox`   | Firefox 分发压缩包，位于 `dist/`       |

加载构建产物的方法见[安装说明](../guide/getting-started.md#安装)。不要直接编辑 `dist/` 中的生成文件。

## 项目结构

- `entrypoints/`：background、content、popup、options 和 welcome 等浏览器上下文。
- `components/`、`composables/`、`stores/`、`utils/`：共享界面、状态与逻辑。
- `assets/`、`locales/`、`types/`：样式、图标、翻译与类型声明。
- `scripts/`：项目工具与本地下载助手。
- `tests/bilibili/`、`tests/downloads/`：对应工具模块的 TypeScript 测试。
- `tests/native/`：原生下载与通信助手的 Python 测试。
- `tests/fixtures/downloads/`：合成媒体和测试支持脚本。
- `wxt.config.ts`：扩展元数据、权限与构建配置。

### 下载工具模块

`utils/downloads/` 按职责组织：

| 目录               | 职责                                                       |
| ------------------ | ---------------------------------------------------------- |
| `queue/`           | 任务创建、身份去重、状态控制、组合汇总、容量限制与执行编排 |
| `batch/`           | 批量任务创建与导入会话持久化                               |
| `history/`         | 长期下载记录、日期分组与 JSON/CSV 序列化                   |
| `files/`           | 下载路径、封面/字幕/弹幕获取与浏览器文件保存               |
| `media/`           | 媒体传输、续传缓存、存储检查与 Worker 封装                 |
| `media/fragments/` | 磁盘上的分片索引、媒体和样本暂存                           |
| `native/`          | 本地助手清单、桥接请求、任务执行租约与任务文件导出         |

根目录保留存储键、显示标签与格式化、错误文本、视频地址解析、启动器点击和扩展消息通信。
从能力所属模块直接导入，不设置统一转发出口。测试继续放在 `tests/downloads/`，由现有测试命令统一运行。

## 验证

提交变更前运行：

```sh
pnpm test
pnpm test:native
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm build:firefox
```

TypeScript 测试使用 `node:test`、`node:assert/strict` 和 `tsx`；本地助手测试使用 Python `unittest`。区分固定样本检查、真实下载与 Firefox 运行验证。

加载生成的扩展并检查所有受影响的浏览器上下文。WebExtension API 或清单行为变更还需验证 Firefox。可见界面变更在 PR 中提供截图或录屏，并说明新增权限或配置要求。

## 文档站点

VitePress 站点默认在 `/` 提供英文，`/zh/` 提供简体中文。`docs/` 与 `docs/zh/` 下的对应页面保持相同的相对路径，语言切换器即可打开另一种语言的同一页面。首页分别位于 `docs/index.md` 和 `docs/zh/index.md`；导航与界面翻译在 `docs/.vitepress/config.ts` 配置。

两种语言使用相同的主题目录：

| 目录           | 内容                                   |
| -------------- | -------------------------------------- |
| `guide/`       | 安装、功能概览、下载、素材与记录       |
| `advanced/`    | 浏览器缓存、本地 FFmpeg 助手与原生集成 |
| `help/`        | 故障排查、权限与隐私                   |
| `development/` | 开发指南、架构、实现里程碑与验证记录   |

在仓库根目录运行：

```sh
pnpm --dir docs install
pnpm docs:dev
pnpm docs:typecheck
pnpm docs:build
```

静态站点输出到 `docs/.vitepress/dist/`，使用 `pnpm --dir docs preview` 预览。

## 延伸阅读

- [使用指南](../guide/usage.md)：下载、队列、批量导入、素材与文件设置。
- [本地助手](../advanced/native-helper.md)：Python、FFmpeg、续传与清理。
- [原生助手集成](../advanced/native-bridge.md)：宿主注册、任务交接、进度与权限。
- [实现方案](implementation.md)：组件、WBI、画质选择、队列与权限。
- [扩展路线图](roadmap.md)：功能阶段与行为契约。
- [验证记录](verification.md)：自动检查、浏览器验证与已知限制。

## 文档维护约定

- 用户文档按「操作步骤、结果、边界、下一步」组织，每页聚焦一个任务。
- `guide/usage.md` 是功能入口；具体操作分别放在下载、批量、素材、文件和排查页面。
- `implementation.md`、`roadmap.md`、`verification.md` 保留架构背景、实施契约与历史证据，避免与当前产品说明混用。
- 新增页面放入对应主题目录，同步中英文相对路径、侧栏和关联链接，保持语言切换可达。
- 主题样式在 `docs/.vitepress/theme/`，站点图标在 `docs/public/`；扩展图标变更后同步更新。
- 文档修改后执行 `pnpm docs:build`，并检查桌面、移动端、深浅色、搜索与语言切换。
