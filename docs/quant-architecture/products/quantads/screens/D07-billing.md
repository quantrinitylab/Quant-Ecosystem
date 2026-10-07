# D07 — Billing

Product: QuantAds
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /billing

## Purpose

Billing: balance, invoices, payment methods.

## Data contract

- API: `GET /api/billing/balance`
- API: `GET /api/billing/invoices`
- API: `GET|POST /api/billing/payment-methods`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Org billing role only.

## Core interactions

- view invoices
- add payment method (tokenized)
- top up

## Reality

Implemented at `src/app/billing/page.tsx` on billing APIs.

