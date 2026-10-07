# X03 — People Discovery

Product: QuantMax
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /nearby

## Purpose

Discover people nearby / matching criteria.

## Data contract

- API: `GET /api/matching/discover`
- API: `GET /api/profiles/[id]`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Discovery requires opt-in; location is coarse by default.

## Core interactions

- browse candidates
- open profile-detail

## Reality

Implemented at `src/pages/nearby.tsx` via `useNearby` + /api/matching/discover.

