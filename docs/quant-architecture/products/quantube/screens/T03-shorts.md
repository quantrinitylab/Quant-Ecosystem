# T03 — Shorts

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /shorts

## Purpose

Vertical short-form video feed.

## Data contract

- API: `video/shorts feed APIs`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public catalog rules.

## Core interactions

- vertical swipe
- like
- comments
- share

## Reality

Implemented at `src/pages/shorts.tsx`.

