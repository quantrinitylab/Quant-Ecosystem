# D01 — Advertiser Home

Product: QuantAds
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /

## Purpose

Advertiser dashboard: spend overview, active campaigns, alerts.

## Data contract

- API: `GET /api/campaigns/dashboard`
- API: `GET /api/analytics/reports`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Org-scoped: advertisers see only their org's data.

## Reality

Implemented at `src/app/page.tsx` on the campaigns-dashboard API.

