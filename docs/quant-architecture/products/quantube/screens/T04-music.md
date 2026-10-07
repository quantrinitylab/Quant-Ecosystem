# T04 — Music

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /music

## Purpose

Music library: tracks, albums, streaming.

## Data contract

- API: `GET /api/music`
- API: `GET /api/music/tracks`
- API: `GET /api/music/albums`
- API: `GET /api/music/tracks/[id]/stream`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Licensed catalog; stream URLs user-scoped and expiring.

## Core interactions

- play track
- album view
- queue

## Reality

Implemented at `src/pages/music.tsx` backed by the music API.

