# W08 — Notifications

Product: QuantWave
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /notifications

## Purpose

Mentions, replies, follows, community activity.

## Data contract

- API: `GET /api/notifications`
- API: `POST /api/notifications/read`
- API: `GET /api/notifications/preferences`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User-scoped.

## Core interactions

- mark read
- notification preferences

## Reality

Implemented at `src/app/notifications/page.tsx` with preferences API.

