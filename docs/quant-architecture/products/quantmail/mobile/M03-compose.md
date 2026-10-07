# QuantMail Flutter — M03 Compose

## Layout

ComposeScreen:
- top bar
- From
- To/Cc/Bcc
- Subject
- body editor
- attachment row
- Quanty assist
- send

## Keyboard behavior

- recipient fields scroll into view
- editor keeps caret visible
- send remains reachable without obscuring keyboard
- draft save status stays visible

## Attachments

Use native picker through capability-scoped bridge.
Upload state is independent from draft editing.

## Offline

Draft creation/editing is local-first only if encrypted local draft policy is implemented.
Send is unavailable offline.

## Lifecycle

Persist draft identity across background/foreground.
Recover interrupted upload and draft save using explicit state.
