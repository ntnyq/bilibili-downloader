# UI primitives

This directory contains the complete installed shadcn-vue component groups backed
by Reka UI, including their registry dependencies. Components were refreshed with
`shadcn-vue@2.8.2` from the official `new-york-v4` registry at
https://shadcn-vue.com/r/styles/new-york-v4/.

- Use `assets/tailwind.css` for shared colors and sizing tokens.
- Keep overlays inside the owning extension surface with `provideOverlayTarget`.
- Select handles Escape locally because WXT isolates Shadow DOM keyboard events,
  and skips exit animations in the provided overlay target so closed layers unmount.
- The download center imports `SidebarMenuButtonChild` directly for its static
  navigation. The complete Sidebar components are available for provider-based
  collapsible navigation.
- Preserve Button's focus API and default button type, plus Progress's
  indeterminate indicator, when refreshing registry source.
- Preserve explicit checkbox array mappings and async Switch updates: persisted
  settings are the source of truth.
- Update the Shadow DOM property defaults when upgrading Tailwind CSS.
