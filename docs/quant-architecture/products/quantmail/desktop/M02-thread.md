# QuantMail Desktop — M02 Thread

## Desktop-specific behavior

- keyboard navigation across messages
- command palette actions
- OS attachment handoff through typed bridge
- notification click deep-links into authorized thread
- multi-window behavior must preserve authorization

## Keyboard

- Esc: return to inbox/contextually close overlay
- j/k: previous/next message when focus is in message stack
- r: reply
- f: forward
- a: archive
- Shift+u: unread
- s: star

Shortcuts must never trigger while typing in the composer unless intentionally scoped.

## Native bridge

Allowed:
- opening a user-approved attachment with OS handler
- system notification

Forbidden:
- renderer-level access to mailbox credentials
- arbitrary filesystem traversal
- arbitrary process execution
