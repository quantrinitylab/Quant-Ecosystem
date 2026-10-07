# A08 — Memory

Product: QuantAI
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /memory (pages router)

## Purpose

Cross-session AI memory: what Quanty remembers, with access log and restore/delete.

## Data contract

- API: `GET|POST /api/memories`
- API: `GET|DELETE /api/memories/[id]`
- API: `POST /api/memories/[id]/restore`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User owns their memory. Cross-app access requires explicit grant + logged reason.

## Core interactions

- browse memories
- restore
- delete
- view access log

## Reality

Implemented at `src/pages/memory.tsx`: memory list with an access log showing which app accessed what and why. Backed by `/api/memories/*`.

