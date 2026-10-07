# A06 — Approval Queue

Product: QuantAI
Status: MISSING — Not implemented — inventory screen with no corresponding UI in the repo.
Priority: P2
Route: (none)

## Purpose

Inventory intent: human-in-the-loop approvals for agent actions (send, delete, spend, external calls).

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

No approval-queue UI or API found. Agent actions currently have no visible human-approval gate in QuantAI. This is a P0-grade gap for any agent that mutates external state.

