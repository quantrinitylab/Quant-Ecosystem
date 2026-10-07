# W02 — Thread

Product: QuantWave
Status: MISSING — Not implemented — inventory screen with no corresponding UI in the repo.
Priority: P1
Route: (none)

## Purpose

Inventory intent: full conversation thread view for a post (replies tree).

## Data contract

- API: `GET /api/posts/[id]`
- API: `GET /api/posts/[id]/comments (backend exists, no thread UI)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

N/A — not implemented.

## Reality

No `/thread`, `/post/[id]`, or equivalent route found. The app metadata describes 'real-time threads' but the code has feed cards only — replies have no dedicated reading surface.

