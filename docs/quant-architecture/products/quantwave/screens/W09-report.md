# W09 — Report

Product: QuantWave
Status: MISSING — Not implemented — inventory screen with no corresponding UI in the repo.
Priority: P2
Route: (none)

## Purpose

Inventory intent: report abusive content/users for moderation.

## Data contract

- No backend endpoint found for this screen.

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

N/A — not implemented.

## Reality

No report flow found in UI or API. This is a trust-&-safety gap: W04/W01 have no in-product reporting path.

