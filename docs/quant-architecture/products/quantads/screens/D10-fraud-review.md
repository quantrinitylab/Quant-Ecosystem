# D10 — Fraud/Review

Product: QuantAds
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /fraud, /brand-safety (pages router)

## Purpose

Ad fraud signals + brand-safety review: flagged activity, blocklists.

## Data contract

- API: `review APIs (page-level)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Org trust-&-safety role.

## Core interactions

- review flagged events
- blocklist domains
- brand-safety settings

## Reality

Implemented at `src/pages/fraud.tsx` + `src/pages/brand-safety.tsx` (pages router).

