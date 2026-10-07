# A09 — Model Playground

Product: QuantAI
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P2
Route: /models (directory); /code

## Purpose

Inventory intent: side-by-side model comparison and prompt experimentation.

## Data contract

- API: `POST /api/models/compare (backend exists, no UI found)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Authenticated users.

## Reality

`/models` is a model directory, not a playground. The compare endpoint exists but no UI calls it. Closest real surface: `/code` agent terminal.

## Ambiguity

Inventory 'Model Playground' implies side-by-side testing; the code has directory + compare API only.

