# X01 — Discovery

Product: QuantMax
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /discover

## Purpose

Discovery home: trending sounds, hashtag challenges, creator spotlights, category video grids.

## Data contract

- API: `GET /api/feed`
- API: `GET /api/feed/trending`
- API: `GET /api/feed/for-you`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public catalog; age-gating where configured.

## Reality

Implemented at `src/pages/discover.tsx` (header: 'Trending sounds, hashtag challenges, creator spotlights, category video grids').

