# X02 — Short Video

Product: QuantMax
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: / (index)

## Purpose

Short-video feed: watch, like, comment, upload.

## Data contract

- API: `GET /api/videos`
- API: `POST /api/videos/[id]/like`
- API: `GET /api/videos/[id]/comments`
- API: `POST /api/videos/upload`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public catalog rules; upload requires auth.

## Core interactions

- vertical feed
- like
- comments
- upload

## Reality

Implemented at `src/pages/index.tsx` (short-video feed) backed by /api/videos.

