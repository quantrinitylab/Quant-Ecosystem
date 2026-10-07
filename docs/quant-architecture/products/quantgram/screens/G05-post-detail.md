# G05 — Post Detail

Product: QuantGram
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /post/[id]

## Purpose

Single post view: media, caption, comments, like/save.

## Data contract

- API: `GET|PATCH|DELETE /api/posts/[id]`
- API: `GET|POST /api/posts/[id]/comments`
- API: `POST /api/posts/[id]/like`
- API: `POST /api/posts/[id]/save`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Post visibility rules apply; only author can edit/delete.

## Core interactions

- like toggle
- comment
- save/unsave
- share

## Reality

Implemented at `src/pages/post/[id].tsx` with comment sheet component.

