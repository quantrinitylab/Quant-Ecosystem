# C11 — Notifications

Product: QuantChat
Status: MISSING — Not implemented — inventory screen with no corresponding UI in the repo.
Priority: P2
Route: (none)

## Purpose

Inventory intent: unified notification center for messages, mentions, calls.

## Data contract

- API: `POST /api/ai/prioritize-notifications (AI ranking only; no notification center API)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

N/A — not implemented.

## Reality

No notifications page or notification-center UI found. Only an AI prioritization endpoint exists. Target spec: `products/quantchat/10-screen-deep-dive-c11-notifications.md`.

