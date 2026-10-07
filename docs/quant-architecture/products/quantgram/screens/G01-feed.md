# G01 — Feed

Product: QuantGram
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: / (index)

## Purpose

Home feed: ranked posts from followed accounts + recommendations, infinite scroll, pull-to-refresh.

## Data contract

- API: `GET /api/feed`
- API: `GET /api/feed/recommendations`
- API: `GET /api/feed/algorithm`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public posts visible to all authed users; private accounts gate via follow.

## Core interactions

- infinite scroll
- pull-to-refresh
- like/save from card
- open post detail

## Reality

Implemented at `src/pages/index.tsx` ('QuantNeon') via `useFeed`: stories bar, post cards, skeletons, Loading/Error/Empty states. Guest hero banner for signed-out users.

## Evidence

- `apps/quantgram/src/pages/index.tsx`
- `apps/quantgram/src/hooks/useFeed.ts`

