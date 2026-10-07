# X08 — Safety

Product: QuantMax
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P2
Route: (no safety UI page)

## Purpose

Inventory intent: safety center — report, block, safety settings, emergency resources.

## Data contract

- API: `POST /api/safety/report`
- API: `GET|PATCH /api/safety/settings`
- API: `POST /api/profiles/report`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Reports authenticated; reporter identity protected.

## Reality

Backend-only: `/api/safety/*` + `/api/profiles/report` exist, but no safety page or in-flow report UI was found. In a dating product this is a P0 trust gap — spec'd as PARTIAL until the UI lands.

