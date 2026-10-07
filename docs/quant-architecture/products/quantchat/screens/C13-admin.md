# C13 — Admin

Product: QuantChat
Status: MISSING — Not implemented — inventory screen with no corresponding UI in the repo.
Priority: P2
Route: (none)

## Purpose

Inventory intent: moderation, user/device management, federation, audit.

## Data contract

- No backend endpoint found for this screen.

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

N/A — not implemented.

## Reality

No admin screen found. Federation admin endpoints exist (`/api/federation/*`) but have no UI. Target spec: `products/quantchat/12-screen-deep-dive-c13-admin-operations.md`.

