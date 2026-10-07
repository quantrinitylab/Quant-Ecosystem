# W07 — Search

Product: QuantWave
Status: MISSING — Not implemented — inventory screen with no corresponding UI in the repo.
Priority: P2
Route: (none)

## Purpose

Inventory intent: search posts, people, communities.

## Data contract

- API: `GET /api/search`
- API: `GET /api/search/suggestions (backend exists, no UI)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

N/A — not implemented.

## Reality

No search page or search box found in UI code; backend endpoints are orphaned.

