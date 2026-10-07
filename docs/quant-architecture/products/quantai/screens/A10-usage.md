# A10 — Usage

Product: QuantAI
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /analytics (pages router)

## Purpose

Usage analytics: consumption over time, by model/feature.

## Data contract

- API: `GET /api/usage (via useUsageAnalytics)`
- API: `GET /api/analytics`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Users see only their own usage.

## Core interactions

- range picker
- usage charts

## Reality

Implemented at `src/pages/analytics.tsx` with `useUsageAnalytics` + `UsageAnalyticsChart`.

