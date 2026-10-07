# T10 — Library

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /library

## Purpose

Personal library: history, watch-later, playlists.

## Data contract

- API: `GET /api/playlists`
- API: `GET|POST /api/playlists/[id]/items`
- API: `GET /api/playlists/watch-later`
- API: `GET /api/interactions/history`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User-scoped (private by default).

## Core interactions

- watch-later toggle
- create playlist
- add/remove items
- clear history

## Reality

Implemented at `src/pages/library.tsx` on playlists + history APIs.

