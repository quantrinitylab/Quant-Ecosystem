# D09 — Attribution

Product: QuantAds
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P2
Route: /pixels (pages router)

## Purpose

Inventory intent: attribution modeling — which touchpoints drove conversions.

## Data contract

- API: `pixel APIs (app-level)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Org-scoped.

## Core interactions

- install pixel
- verify pixel firing

## Reality

Partial: `/pixels` (pages router) covers pixel installation/verification. No attribution model dashboard or multi-touch reporting UI was found.

