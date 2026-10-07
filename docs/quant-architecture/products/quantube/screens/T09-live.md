# T09 — Live

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /live

## Purpose

Live streams: watch, live chat, go-live entry.

## Data contract

- API: `GET|POST /api/live`
- API: `GET /api/live/[id]`
- API: `GET|POST /api/live/[id]/chat`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Chat requires auth; stream creation is creator-gated.

## Core interactions

- watch live
- live chat
- viewer count

## Reality

Implemented at `src/pages/live.tsx` with live-chat API.

