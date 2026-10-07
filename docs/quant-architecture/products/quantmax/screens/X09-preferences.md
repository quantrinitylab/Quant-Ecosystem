# X09 — Preferences

Product: QuantMax
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P2
Route: (no preferences UI page)

## Purpose

Inventory intent: discovery/matching preferences (age range, distance, interests).

## Data contract

- API: `GET|PATCH /api/videochat/preferences`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User-scoped.

## Reality

Backend-only: `/api/videochat/preferences` exists; no preferences screen found.

