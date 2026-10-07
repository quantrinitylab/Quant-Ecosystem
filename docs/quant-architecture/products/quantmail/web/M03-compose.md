# QuantMail Web — M03 Compose

## Layout

Compact desktop compose:
- draggable/resizable where supported
- recipient header
- subject
- editor
- attachment tray
- footer actions

Full-screen fallback:
- narrow viewport
- accessibility mode
- complex draft/attachment workflows

## Editor

Use a structured document model.
Store semantic content, not browser-specific HTML.

Required:
- keyboard shortcuts
- paste normalization
- undo/redo
- link insertion
- quote handling

## Draft persistence

UI state:
- dirty
- saving
- saved
- failed
- offline

Server version is authoritative.
Conflict presents recovery rather than silent overwrite.

## Send

Clicking Send starts prepare-send, not direct provider submission.
After successful preparation, the final send boundary applies.

## Accessibility

- labels for recipients
- keyboard order
- screen-reader announcements for save state
- send errors announced
- no hover-only controls
