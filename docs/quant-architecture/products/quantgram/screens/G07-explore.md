# G07 — Explore

Product: QuantGram
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /explore

## Purpose

Discovery: trending posts, topics, search entry.

## Data contract

- API: `GET /api/explore`
- API: `GET /api/explore/search`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Only public/eligible content surfaces.

## Reality

Implemented at `src/pages/explore.tsx` backed by /api/explore.

