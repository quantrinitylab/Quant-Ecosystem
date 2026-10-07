# X06 — Live

Product: QuantMax
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /live

## Purpose

Live streaming with join/end lifecycle.

## Data contract

- API: `GET|POST /api/live`
- API: `POST /api/live/start`
- API: `POST /api/live/[id]/join`
- API: `POST /api/live/[id]/end`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Going live requires auth; viewers per stream policy.

## Reality

Implemented at `src/pages/live.tsx` on the live API.

