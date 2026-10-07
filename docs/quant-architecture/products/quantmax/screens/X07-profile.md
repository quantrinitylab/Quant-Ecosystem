# X07 — Profile

Product: QuantMax
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /profile, /profile-detail

## Purpose

Dating profile: photos, prompts, preferences; view others' profiles.

## Data contract

- API: `GET|PATCH /api/profiles/[id]`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Own profile editable; others read-only per visibility.

## Core interactions

- 6 photo slots (drag reorder)
- 3 prompt/answer slots
- profile-detail view

## Reality

Implemented at `src/pages/profile.tsx` (editor) + `src/pages/profile-detail.tsx`.

