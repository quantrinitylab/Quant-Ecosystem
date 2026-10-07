# T05 — Search

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /search

## Purpose

Search videos, channels, music.

## Data contract

- API: `GET /api/search`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public catalog; restriction flags respected.

## Reality

Implemented at `src/pages/search.tsx` via /api/search.

