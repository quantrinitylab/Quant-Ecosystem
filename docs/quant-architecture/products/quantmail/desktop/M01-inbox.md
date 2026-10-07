# QuantMail Desktop — M01 Inbox

Target: Tauri desktop.

## Desktop value

- keyboard-first navigation
- command palette
- multi-window/deep-link support where implemented
- OS notifications through a permissioned bridge
- controlled drag/drop

## Chrome

- native window integration
- QuantMail sidebar
- global app switcher
- command palette
- inbox content
- optional context rail

Do not import a second mobile shell.

## Native bridge

Allowed requests:
- notification permission
- OS notification
- deep-link handling

Renderer cannot directly access:
- credentials
- mailbox secrets
- unrestricted filesystem mail stores
- arbitrary process execution

Bridge calls are typed and capability-scoped.
