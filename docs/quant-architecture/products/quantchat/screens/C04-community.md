# C04 — Community

Product: QuantChat
Status: MISSING — Not implemented — inventory screen with no corresponding UI in the repo.
Priority: P2
Route: (none)

## Purpose

Inventory intent: large-scale community spaces (Discord/Telegram-community style) with channels and roles.

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

No community UI, API routes, or data model found in `apps/quantchat`. The deep-dive docs (`04-screen-deep-dive-c03-c04-c05.md`) describe the TARGET state; treat them as the build spec.

