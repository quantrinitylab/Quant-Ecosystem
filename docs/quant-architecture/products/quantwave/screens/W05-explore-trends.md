# W05 — Explore/Trends

Product: QuantWave
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /trending

## Purpose

Trending topics and explore surface.

## Data contract

- API: `GET /api/trending`
- API: `GET /api/explore`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public.

## Reality

Implemented at `src/app/trending/page.tsx` via /api/trending.

