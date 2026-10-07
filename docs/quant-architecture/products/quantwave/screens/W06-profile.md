# W06 — Profile

Product: QuantWave
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /profile

## Purpose

User profile: posts, likes, bookmarks entry.

## Data contract

- API: `profile APIs (app-level)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Own profile editable; others read-only.

## Reality

Implemented at `src/app/profile/page.tsx`; `/bookmarks` is a profile-adjacent extra.

