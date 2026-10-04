# Repository Guidelines

## Project Structure & Module Organization

This is a WXT browser extension built with Vue 3 and TypeScript. Browser contexts
live under `entrypoints/`: `background/`, `content/`, `popup/`, `options/`, and
`welcome/`. Keep context-specific code within its entrypoint; move shared UI,
state, and logic to `components/`, `stores/`, `composables/`, or `utils/`.
Extension metadata and build behavior are defined in `wxt.config.ts`. Static
styles and icons belong in `assets/`, translations in `locales/`, declarations
in `types/`, and project tooling helpers in `scripts/`. Generated output goes to
`dist/` and should not be edited directly.

## Build, Test, and Development Commands

Use the pinned pnpm version from `package.json`.

- `pnpm install` installs dependencies and runs `wxt prepare`.
- `pnpm dev` starts Chromium development; `pnpm dev:firefox` targets Firefox.
- `pnpm build` creates a production Chromium build; use `build:firefox` for
  Firefox.
- `pnpm zip` or `pnpm zip:firefox` creates distributable archives.
- `pnpm typecheck` runs `vue-tsc` without emitting files.
- `pnpm lint` checks ESLint rules.
- `pnpm format:check` verifies oxfmt formatting; `pnpm format` applies it.

## Coding Style & Naming Conventions

Follow the repository ESLint config and `.oxfmtrc.jsonc`: two-space indentation,
single quotes, no semicolons, trailing commas, and an 80-column target. Use Vue
Composition API with `<script setup lang="ts">`. Name Vue components in
PascalCase (`Navbar.vue`), functions and modules in camelCase, composables with a
`use` prefix, and constants in uppercase. Prefer existing WXT/Vue auto-imports
and the `~` root alias. Use Tailwind CSS utilities and shadcn-vue primitives from `components/ui/`.
Define shared design tokens in `assets/tailwind.css`; keep content-script
portals inside the Shadow DOM with `provideOverlayTarget`.

## Testing Guidelines

No automated test framework or coverage threshold is currently configured.
Before submitting changes, run `pnpm format:check`, `pnpm lint`, `pnpm
typecheck`, and `pnpm build`. Manually load the generated extension and exercise
every affected browser context; test Firefox too when changing WebExtension
APIs or manifest behavior. If adding tests, use `*.test.ts` beside the subject
or in a clearly named `tests/` directory, and add the runner command to
`package.json` and CI.

## Commit & Pull Request Guidelines

Recent history follows concise Conventional Commit subjects such as `feat: bump
wxt to v0.20.0`, `fix: fix notification api`, and `chore: update`. Use a
lowercase type (`feat`, `fix`, `chore`, `docs`, or `refactor`) and an imperative,
focused summary. Pull requests should explain the behavior change, link relevant
issues, list verification commands and tested browsers, and include screenshots
or recordings for visible popup, options, content, or welcome-page changes.
Keep changes scoped and call out new permissions or configuration requirements.
