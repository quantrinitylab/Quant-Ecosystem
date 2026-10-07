# G04 — Camera/Editor

Product: QuantGram
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /camera

## Purpose

In-app camera with AR filters/lenses and basic editing before posting.

## Data contract

- API: `GET /api/ar/filters`
- API: `POST /api/ar/process`
- API: `GET /api/ar-lenses/capabilities`
- API: `POST /api/ar-lenses/consent`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Camera permission is device-level; lens use requires consent record.

## Reality

Implemented at `src/pages/camera.tsx` with AR filters + AR lens consent flow (`features/ar-lenses`).

