# K02 — Projects

Product: QuantCooks
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /projects, /projects-gallery

## Purpose

Project library: browse, duplicate, delete, open in editor.

## Data contract

- API: `GET|POST /api/projects`
- API: `GET|PATCH|DELETE /api/projects/[id]`
- API: `POST /api/projects/[id]/duplicate`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Owner-scoped; collaborators per invite.

## Core interactions

- grid/gallery view
- duplicate
- delete
- open in editor

## Reality

Implemented at `src/pages/projects.tsx` + `src/pages/projects-gallery.tsx`, backed by project CRUD.

