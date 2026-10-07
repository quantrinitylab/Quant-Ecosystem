# K05 — Assets

Product: QuantCooks
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /assets

## Purpose

Asset library: uploaded media, stock, brand assets for projects.

## Data contract

- API: `GET|POST /api/assets`
- API: `POST /api/assets/upload`
- API: `GET|DELETE /api/assets/[id]`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User-scoped library.

## Core interactions

- upload
- browse/search
- insert into project
- delete

## Reality

Implemented at `src/pages/assets.tsx` with `AssetLibrary.tsx`, backed by asset CRUD + upload.

