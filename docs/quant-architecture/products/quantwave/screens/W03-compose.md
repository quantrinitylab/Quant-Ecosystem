# W03 — Compose

Product: QuantWave
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /compose

## Purpose

Create a short post (optionally with poll/quote).

## Data contract

- API: `POST /api/posts`
- API: `POST /api/ai/suggestions`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Authenticated users; rate-limited.

## Core interactions

- compose
- AI suggestions
- poll attach
- post

## Reality

Implemented at `src/app/compose/page.tsx`; polls supported via /api/posts/[id]/poll/vote.

