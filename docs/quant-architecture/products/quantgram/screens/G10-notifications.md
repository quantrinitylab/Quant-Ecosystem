# G10 — Notifications

Product: QuantGram
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /notifications

## Purpose

Activity notifications: likes, follows, comments, mentions.

## Data contract

- API: `GET /api/notifications`
- API: `POST /api/notifications/[id]/read`
- API: `POST /api/notifications/read-all`
- API: `GET /api/notifications/unread-count`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User sees only their own notifications.

## Core interactions

- mark read
- mark all read
- unread badge

## Reality

Implemented at `src/pages/notifications.tsx` with full read/unread API.

