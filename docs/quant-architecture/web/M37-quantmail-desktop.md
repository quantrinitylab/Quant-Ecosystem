# M37 — QuantMail Desktop UX Contract

## Desktop composition
Global workspace switcher → Mail rail → main mailbox/thread surface → optional context rail.

Inbox target: dense rows with stable columns for selection, sender, subject/snippet, labels/context, and timestamp. Avoid card-heavy layouts that destroy scan speed.

## Thread
Use a two-level hierarchy: thread header and message cards. Keep primary actions stable while scrolling. Context rail may pin people/files/events but must collapse cleanly.

## Compose
Default compact composer. Expand to focused editor. Drag/drop attachments and recipients where safe. Minimize preserves the draft without changing ownership.

## Keyboard
J/K, Enter/Open, Esc/Back, R, A, F, S, E/Archive where configured, / or Cmd/Ctrl+K for search/command surface. Shortcut availability is discoverable and customizable.

## Bulk operations
Selection toolbar appears only when selection exists. Dangerous bulk actions require confirmation or undo according to risk. Partial failures report exactly which items were not changed.
