# X04 — Match

Product: QuantMax
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /matching, /matches

## Purpose

Swipe-to-match and match list.

## Data contract

- API: `GET /api/matching/matches`
- API: `POST /api/matching/swipe`
- API: `GET /api/matching/[id]`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Mutual opt-in required for match visibility.

## Core interactions

- swipe cards (Tinder-style, framer-motion)
- match celebration
- match list

## Reality

Implemented at `src/pages/matching.tsx` (swipe) + `src/pages/matches.tsx` (list), backed by /api/matching.

