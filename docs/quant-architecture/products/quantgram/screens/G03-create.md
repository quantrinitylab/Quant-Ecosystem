# G03 — Create

Product: QuantGram
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /create

## Purpose

Create a post: media pick, caption, publish.

## Data contract

- API: `POST /api/posts`
- API: `POST media upload-url flow`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Authenticated users; uploads scoped to the user.

## Reality

Implemented at `src/pages/create.tsx`.

