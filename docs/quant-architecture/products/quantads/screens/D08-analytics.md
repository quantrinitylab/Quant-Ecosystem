# D08 — Analytics

Product: QuantAds
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /analytics

## Purpose

Campaign analytics: impressions, clicks, spend, conversions over time.

## Data contract

- API: `GET /api/analytics/campaigns/[id]`
- API: `GET /api/analytics/reports`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Org-scoped.

## Core interactions

- campaign picker
- date range
- metric breakdown
- export report

## Reality

Implemented at `src/app/analytics/page.tsx` on analytics APIs.

