# G06 — Profile

Product: QuantGram
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /profile/[id]

## Purpose

User profile: bio, stats, post grid, follow/close-friend actions.

## Data contract

- API: `GET /api/profiles/[id]`
- API: `POST /api/profiles/[id]/follow`
- API: `POST /api/profiles/[id]/close-friend`
- API: `GET /api/posts/user/[userId]`
- API: `GET /api/profiles/me`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Private profiles hide posts from non-followers; follow is explicit.

## Core interactions

- follow/unfollow
- close-friend toggle
- post grid
- highlights (/highlights)

## Reality

Implemented at `src/pages/profile/[id].tsx`; `/highlights` and `/close-friends` are profile-adjacent extras.

