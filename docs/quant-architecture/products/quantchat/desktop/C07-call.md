# QuantChat — C07 Call (Desktop)

No native desktop client exists in the repo (no Tauri/Electron target).
Desktop is the responsive web build of the same Next.js route.

## Layout

Responsive web build at >=1024px: wider grid, hover affordances, keyboard shortcuts where the component implements them.

## Conventions

- keyboard navigation where the component supports it (chat threads, lists)
- hover actions must have click/tap equivalents (no hover-only actions)
- no console errors on the happy path

