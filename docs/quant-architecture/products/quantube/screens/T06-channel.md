# T06 — Channel

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /channel/[id]

## Purpose

Channel page: branding, video grid, subscribe.

## Data contract

- API: `GET /api/channels/[id]`
- API: `POST /api/channels/[id]/subscribe`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public; subscribe requires auth.

## Core interactions

- subscribe/unsubscribe
- video grid
- about

## Reality

Implemented at `src/pages/channel/[id].tsx` with subscribe API.

