# K01 — Home

Product: QuantCooks
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P1
Route: / (index)

## Purpose

Home: recent projects, templates entry, create-new entry.

## Data contract

- API: `project list APIs`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User-scoped.

## Reality

Implemented at `src/pages/index.tsx` as the QuantEdits home.

