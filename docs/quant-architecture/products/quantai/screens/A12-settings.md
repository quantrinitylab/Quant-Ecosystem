# A12 — Settings

Product: QuantAI
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /settings

## Purpose

QuantAI preferences: defaults, model defaults, privacy, integrations.

## Data contract

- API: `settings APIs (app-level)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User-scoped.

## Reality

Implemented at `src/app/settings/page.tsx`.

