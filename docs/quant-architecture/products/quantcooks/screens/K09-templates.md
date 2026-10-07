# K09 — Templates

Product: QuantCooks
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /templates

## Purpose

Template gallery: browse and start a project from a template.

## Data contract

- API: `GET /api/templates`
- API: `GET /api/templates/[id]`
- API: `POST /api/templates/[id]/use`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Public gallery; use creates a user-owned copy.

## Core interactions

- browse
- preview
- use template

## Reality

Implemented at `src/pages/templates.tsx` on template APIs.

