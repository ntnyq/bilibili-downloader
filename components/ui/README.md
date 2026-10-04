# UI primitives

This directory contains owned shadcn-vue components backed by Reka UI.
The initial Button, Input, Select, Progress and Shadow DOM integration follow
`x-video-downloader`. Additional primitives come from the official
`new-york-v4` registry at https://www.shadcn-vue.com/r/styles/new-york-v4/.

- Use `assets/tailwind.css` for shared colors and sizing tokens.
- Keep overlays inside the owning extension surface with `provideOverlayTarget`.
- Select handles Escape locally because WXT isolates Shadow DOM keyboard events.
- Sidebar uses the registry's static menu/content/footer primitives. The design
  keeps navigation visible and does not need a collapsible provider or shortcut.
- Preserve explicit checkbox array mappings and async Switch updates: persisted
  settings are the source of truth.
- Update the Shadow DOM property defaults when upgrading Tailwind CSS.
