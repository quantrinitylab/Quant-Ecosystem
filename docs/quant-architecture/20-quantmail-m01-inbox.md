# QuantMail M01 — Inbox Deep Design

Status: specification-first.

## Objective
Canonical QuantMail triage surface: high information density, fast interaction and useful contextual intelligence without visual overload.

## Desktop regions
Global identity/app switcher; mailbox navigation; primary toolbar; search; filter/lens row; thread list; optional contextual rail; compose entry; notifications/Quanty entry.

## Mobile regions
Top Quant pillar switcher; compact search/command entry; filter chips; thread list; one contextual bottom navigation; compose action that never obstructs selection. Never squeeze the desktop sidebar into mobile.

## Thread row
Thread id, sender, participant count, subject, snippet, timestamp, unread, star, importance, attachment, labels, security indicator and optional Quant context such as Your turn / Waiting / Meeting / Security.

## Interactions
Open thread, bulk selection, safe mobile swipe actions, desktop keyboard shortcuts, mobile refresh, cursor pagination and scope-preserving search.

## States
Loading, populated, empty mailbox, filtered empty, search empty, partial page, network error, auth expiry, reconnecting and stale cached data.

## Backend query
`mail.threads.list`: mailbox, labels, filters, cursor, page size, sort → threads + next cursor + server timestamp + consistency metadata.

Commands: archive, read/unread, star/unstar, label add/remove, spam, delete. Bulk commands are idempotent.

## Quanty
Read-only suggestions can be automatic. Side effects require approval unless an explicit policy grants the action.

## Verification
Chrome desktop, Chrome mobile, Flutter Android and Flutter iOS: login → inbox → filter → open → back → bulk action → compose.