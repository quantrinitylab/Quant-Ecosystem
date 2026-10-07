# G08 — Reels

Product: QuantGram
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /reels

## Purpose

Vertical short-video feed with comments and likes.

## Data contract

- API: `GET /api/reels/feed`
- API: `GET|POST /api/reels/[id]/comments`
- API: `POST /api/reels/[id]/like`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Same visibility rules as posts.

## Core interactions

- vertical swipe feed
- like
- comments sheet (ReelsCommentsSheet)

## Reality

Implemented at `src/pages/reels.tsx` via reels feed API.

