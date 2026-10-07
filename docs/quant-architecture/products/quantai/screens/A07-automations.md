# A07 — Automations

Product: QuantAI
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /automation (pages router)

## Purpose

User-built automations: trigger → steps → actions, with manual run and enable/disable.

## Data contract

- API: `GET|POST /api/automations`
- API: `GET|PATCH|DELETE /api/automations/[id]`
- API: `POST /api/automations/[id]/execute`
- API: `POST /api/automations/[id]/toggle`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User-scoped. Execution runs as the user.

## Core interactions

- visual node canvas
- configure node
- execute now
- toggle enabled
- view run status

## Reality

Implemented at `src/pages/automation.tsx` — node-based builder with run statuses, backed by full CRUD + execute/toggle APIs.

## Evidence

- `apps/quantai/src/pages/automation.tsx`

