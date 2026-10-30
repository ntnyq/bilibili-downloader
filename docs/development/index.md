# Development

[Documentation home](../index.md) · [简体中文](../zh/development/index.md)

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

See the [installation instructions](../guide/getting-started.md#install) to load a build.
Generated files in `dist/` should not be edited directly.

## Project structure

- `entrypoints/`: browser contexts, including background, content, popup, options, and welcome pages.
- `components/`, `composables/`, `stores/`, `utils/`: shared UI, state, and logic.
- `assets/`, `locales/`, `types/`: styles, icons, translations, and declarations.
- `scripts/`: tooling and native download helpers.
- `tests/bilibili/`, `tests/downloads/`: TypeScript tests for the corresponding utility modules.
- `tests/native/`: Python tests for native download and messaging helpers.
- `tests/fixtures/downloads/`: synthetic media fixtures and test support scripts.
- `wxt.config.ts`: extension metadata, permissions, and build configuration.

### Download utilities

`utils/downloads/` is grouped by responsibility:

| Directory          | Responsibility                                                                        |
| ------------------ | ------------------------------------------------------------------------------------- |
| `queue/`           | Job creation, identity, control, bundle summaries, capacity, and runner orchestration |
| `batch/`           | Batch job creation and persisted import sessions                                      |
| `history/`         | Long-term library records, calendar grouping, and JSON/CSV serialization              |
| `files/`           | Download paths, cover/subtitle/danmaku fetching, and browser file saving              |
| `media/`           | Media transfer, resumable cache, storage checks, and Worker remuxing                  |
| `media/fragments/` | Disk-backed fragment indexes, media, and samples                                      |
| `native/`          | Native helper manifests, bridge requests, task leases, and task-file exports          |

Root modules contain storage keys, display labels and formatters, error text,
video-location parsing, launcher clicks, and extension messaging. Import each
capability from its owning module; there is no aggregate barrel. Tests remain
under `tests/downloads/` so the existing test runner covers every suite.

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

## Documentation site

The VitePress site uses English at `/` and Simplified Chinese at `/zh/`.
Keep matching relative page paths in `docs/` and `docs/zh/` so the language switcher
can open the same page in either language. Homepages live in `docs/index.md`
and `docs/zh/index.md`; navigation and translated theme labels are configured
in `docs/.vitepress/config.ts`.

Both languages use the same topic directories:

| Directory      | Content                                                        |
| -------------- | -------------------------------------------------------------- |
| `guide/`       | Installation, feature overview, downloads, assets, and history |
| `advanced/`    | Browser cache, local FFmpeg helper, and native integration     |
| `help/`        | Troubleshooting, permissions, and privacy                      |
| `development/` | Development guide, architecture, milestones, and verification  |

Run these commands from the repository root:

```sh
pnpm --dir docs install
pnpm docs:dev
pnpm docs:typecheck
pnpm docs:build
```

The static site is generated in `docs/.vitepress/dist/`. Preview it with
`pnpm --dir docs preview`.

## Further reading

- [Usage guide](../guide/usage.md): downloads, queue controls, batch imports, assets, and file settings.
- [Local helper](../advanced/native-helper.md): Python and FFmpeg setup, resumable downloads, and cleanup.
- [Native integration](../advanced/native-bridge.md): host registration, task handoff, progress, and permissions.
- [Architecture](implementation.md): components, WBI, quality selection, queue behavior, and permissions.
- [Roadmap](roadmap.md): feature milestones and behavior contracts.
- [Verification records](verification.md): automated checks, browser verification, and known limits.

## Documentation conventions

- Organize user guides around steps, expected results, limits, and a next action; keep one task per page.
- `guide/usage.md` is the feature entry point; detailed tasks live in download, batch, asset, file, and troubleshooting pages.
- `implementation.md`, `roadmap.md`, and `verification.md` retain architecture context, implementation contracts, and historical evidence, separately from current product guidance.
- Add pages to the appropriate topic directory with matching English and Chinese relative paths, sidebar entries, and related links so language switching stays on the same topic.
- Theme styles live in `docs/.vitepress/theme/`; the site icon lives in `docs/public/` and should follow extension icon changes.
- Run `pnpm docs:build` after documentation edits and check desktop, mobile, both appearances, search, and language switching.
