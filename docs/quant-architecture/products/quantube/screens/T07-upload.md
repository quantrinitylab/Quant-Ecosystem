# T07 — Upload

Product: QuanTube
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /upload

## Purpose

Creator upload: file select, metadata, processing, publish.

## Data contract

- API: `POST /api/media/uploads`
- API: `POST /api/media/uploads/[id]/complete`
- API: `GET /api/media/library`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Authenticated creators; uploads scoped to the uploader.

## Core interactions

- select file
- edit metadata
- upload progress
- processing state
- publish

## Reality

Implemented at `src/pages/upload.tsx` on the resumable-upload API.

