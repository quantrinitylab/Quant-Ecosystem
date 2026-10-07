# T11 — Premium

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /premium

## Purpose

Premium subscription: benefits, subscribe, manage.

## Data contract

- API: `GET|POST /api/payments/intents`
- API: `GET /api/payments/config`
- API: `GET /api/payments/customers`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Authenticated users; payment handled server-side.

## Reality

Implemented at `src/pages/premium.tsx` on the payments API.

