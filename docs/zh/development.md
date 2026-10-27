# 开发指南

[文档首页](index.md) · [English](../development.md)

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

加载构建产物的方法见[安装说明](getting-started.md#安装)。不要直接编辑 `dist/` 中的生成文件。

## 项目结构

- `entrypoints/`：background、content、popup、options 和 welcome 等浏览器上下文。
- `components/`、`composables/`、`stores/`、`utils/`：共享界面、状态与逻辑。
- `assets/`、`locales/`、`types/`：样式、图标、翻译与类型声明。
- `scripts/`：项目工具与本地下载助手。
- `tests/bilibili/`、`tests/downloads/`：对应工具模块的 TypeScript 测试。
- `tests/native/`：原生下载与通信助手的 Python 测试。
- `tests/fixtures/downloads/`：合成媒体和测试支持脚本。
- `wxt.config.ts`：扩展元数据、权限与构建配置。

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

加载生成的扩展并检查所有受影响的浏览器上下文。WebExtension API 或清单行为变更还需验证 Firefox。可见界面变更在 PR 中提供截图或录屏，并说明新增权限或配置要求。

## 文档站点

VitePress 站点默认在 `/` 提供英文，`/zh/` 提供简体中文。`docs/` 与 `docs/zh/` 下的对应页面保持同名，语言切换器即可打开另一种语言的同一页面。首页分别位于 `docs/index.md` 和 `docs/zh/index.md`；导航与界面翻译在 `docs/.vitepress/config.ts` 配置。

在仓库根目录运行：

```sh
pnpm --dir docs install
pnpm docs:dev
pnpm docs:typecheck
pnpm docs:build
```

静态站点输出到 `docs/.vitepress/dist/`，使用 `pnpm --dir docs preview` 预览。

## 延伸阅读

- [使用指南](usage.md)：下载、队列、批量导入、素材与文件设置。
- [本地助手](native-helper.md)：Python、FFmpeg、续传与清理。
- [原生助手集成](native-bridge.md)：宿主注册、任务交接、进度与权限。
- [实现方案](implementation.md)：组件、WBI、画质选择、队列与权限。
- [扩展路线图](roadmap.md)：功能阶段与行为契约。
- [验证记录](verification.md)：自动检查、浏览器验证与已知限制。

## 文档维护约定

- 用户文档按「操作步骤、结果、边界、下一步」组织，每页聚焦一个任务。
- `usage.md` 是功能入口；具体操作分别放在下载、批量、素材、文件和排查页面。
- `implementation.md`、`roadmap.md`、`verification.md` 保留架构背景、实施契约与历史证据，避免与当前产品说明混用。
- 新增页面时同步中英文文件名、侧栏和关联链接，保持语言切换可达。
- 主题样式在 `docs/.vitepress/theme/`，站点图标在 `docs/public/`；扩展图标变更后同步更新。
- 文档修改后执行 `pnpm docs:build`，并检查桌面、移动端、深浅色、搜索与语言切换。
