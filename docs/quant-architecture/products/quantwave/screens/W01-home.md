# W01 — Home

Product: QuantWave
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /

## Purpose

Home timeline: ranked short posts with engagement actions.

## Data contract

- API: `GET /api/feed`
- API: `POST /api/feed/engagement`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public timeline; blocks/mutes respected.

## Core interactions

- like
- repost/quote
- reply
- bookmark
- share

## Reality

Implemented at `src/app/page.tsx` via /api/feed; engagement via /api/feed/engagement.

## Evidence

- `apps/quantwave/src/app/page.tsx`

