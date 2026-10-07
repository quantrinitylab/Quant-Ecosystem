# D05 — Audience

Product: QuantAds
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /audiences

## Purpose

Audience builder: interests, behaviors, lookalikes; reach estimates.

## Data contract

- API: `GET|POST /api/audiences`
- API: `GET /api/targeting/interests`
- API: `GET /api/targeting/behaviors`
- API: `GET /api/targeting/estimate`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Org-scoped.

## Core interactions

- criteria builder
- reach estimate
- save audience

## Reality

Implemented at `src/app/audiences/page.tsx` on audiences + targeting APIs.

