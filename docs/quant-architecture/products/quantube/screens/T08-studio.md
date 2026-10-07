# T08 — Studio

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /studio

## Purpose

Creator studio: manage videos, see performance basics, channel settings.

## Data contract

- API: `creator APIs (features/studio)`
- API: `GET /api/creator/dashboard`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Channel owner only.

## Reality

Implemented at `src/pages/studio.tsx`; deeper analytics live in /monetization (T12).

