# T02 — Watch

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /watch/[id]

## Purpose

Video player page: playback, comments, like, subscribe, up-next.

## Data contract

- API: `video APIs`
- API: `GET|POST /api/interactions/comments`
- API: `POST /api/interactions/like`
- API: `GET /api/interactions/history`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public unless restricted; comments require auth.

## Core interactions

- play/pause/seek
- like
- comment
- subscribe
- up-next autoplay

## Reality

Implemented at `src/pages/watch/[id].tsx` with comments + like interactions.

