# M39 — QuantDrive Desktop UX Contract

## Shell
Workspace switcher → Drive navigation rail → breadcrumb/header → file workspace → optional details/activity rail.

## List mode
Columns: selection, name/type, owner, modified, size, sharing/security state, contextual actions. Name remains the strongest anchor.

## Grid mode
Large visual previews for supported files, compact metadata, selection affordance, and predictable context menu. Grid must not hide security or sharing state entirely.

## Preview
Desktop preview opens in a focused viewer with next/previous navigation for a result set. Details and actions are available without forcing the user back to the folder.

## Drag/drop
Drag/drop upload and move are supported only with clear drop targets and explicit pending feedback. Moving a file never silently changes sharing semantics.

## Command/keyboard
Search, new, upload, rename, move, share, preview, and navigation actions should have discoverable keyboard alternatives. Text fields retain native typing behavior.
