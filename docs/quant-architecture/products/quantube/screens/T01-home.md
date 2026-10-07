# T01 — Home

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: / (index)

## Purpose

Home: recommended videos, subscriptions rail, continue-watching.

## Data contract

- API: `GET /api/feed`
- API: `GET /api/feed/recommendations`
- API: `GET /api/ai/recommendations`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public catalog; age/restriction flags respected.

## Reality

Implemented at `src/pages/index.tsx` via feed APIs.

## Evidence

- `apps/quantube/src/pages/index.tsx`

