# Development

[English homepage](../README.md) · [中文首页](../README-zh.md)

The extension is built with WXT, Vue 3, TypeScript, and Tailwind CSS.
Use the pnpm version pinned in `package.json`.

## Local development

```sh
pnpm install
pnpm dev
```

Use `pnpm dev:firefox` for Firefox development. Dependency installation runs
`wxt prepare` to generate the extension's types and configuration.

## Build and package

| Command              | Output                                   |
| -------------------- | ---------------------------------------- |
| `pnpm build`         | Chromium extension in `dist/chrome-mv3/` |
| `pnpm build:firefox` | Firefox extension in `dist/firefox-mv3/` |
| `pnpm zip`           | Chromium distribution archive in `dist/` |
| `pnpm zip:firefox`   | Firefox distribution archive in `dist/`  |

See the [installation instructions](../README.md#install) to load a build.
Generated files in `dist/` should not be edited directly.

## Project structure

- `entrypoints/`: browser contexts, including background, content, popup, options, and welcome pages.
- `components/`, `composables/`, `stores/`, `utils/`: shared UI, state, and logic.
- `assets/`, `locales/`, `types/`: styles, icons, translations, and declarations.
- `scripts/`: tooling and native download helpers.
- `wxt.config.ts`: extension metadata, permissions, and build configuration.

## Verification

Run the following checks before submitting changes:

```sh
pnpm test
pnpm test:native
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm build:firefox
```

Load the generated extension and exercise each affected browser context.
Changes to WebExtension APIs or manifest behavior also need Firefox testing.
Include screenshots or recordings for visible UI changes and describe any new
permissions or configuration requirements in the pull request.

## Further reading

The following guides are currently in Chinese:

- [Usage guide](usage.md): downloads, queue controls, batch imports, assets, and file settings.
- [Local helper](native-helper.md): Python and FFmpeg setup, resumable downloads, and cleanup.
- [Native integration](native-bridge.md): host registration, task handoff, progress, and permissions.
- [Architecture](implementation.md): components, WBI, quality selection, queue behavior, and permissions.
- [Roadmap](roadmap.md): feature milestones and behavior contracts.
- [Verification records](verification.md): automated checks, browser verification, and known limits.
