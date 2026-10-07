# G09 — Messages Handoff

Product: QuantGram
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /messages

## Purpose

Direct messages inside QuantGram; handoff point to QuantChat for full messaging.

## Data contract

- API: `GET|POST /api/dm/conversations`
- API: `GET|POST /api/dm/conversations/[id]/messages`
- API: `POST /api/dm/conversations/[id]/read`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Participants only.

## Reality

Implemented at `src/pages/messages.tsx` on the DM API. The 'handoff' to QuantChat is conceptual — no deep-link/SSO-handoff flow into QuantChat was found in code.

## Ambiguity

Inventory says 'Messages Handoff' implying a bridge into QuantChat. The code has a working in-app DM inbox; the cross-app handoff itself is not implemented.

