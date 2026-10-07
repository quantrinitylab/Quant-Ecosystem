# W04 — Communities

Product: QuantWave
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /communities

## Purpose

Topic communities: browse, join, read community-scoped posts.

## Data contract

- API: `GET|POST /api/communities`
- API: `GET /api/communities/[id]`
- API: `POST /api/communities/[id]/join`
- API: `POST /api/communities/[id]/leave`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Membership gates posting in restricted communities.

## Core interactions

- browse
- join/leave
- community feed

## Reality

Implemented at `src/app/communities/page.tsx` with join/leave API.

