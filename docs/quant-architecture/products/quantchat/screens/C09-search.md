# C09 — Search

Product: QuantChat
Status: MISSING — Not implemented — inventory screen with no corresponding UI in the repo.
Priority: P2
Route: (none)

## Purpose

Inventory intent: unified search across messages, people, channels.

## Data contract

- API: `GET /api/search`
- API: `POST /api/search/index (backend exists, no UI)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

N/A — not implemented.

## Reality

Backend endpoints `/api/search` and `/api/search/index` exist, but no search page or search box wires to them. Target spec: `products/quantchat/08-screen-deep-dive-c09-search.md`.

