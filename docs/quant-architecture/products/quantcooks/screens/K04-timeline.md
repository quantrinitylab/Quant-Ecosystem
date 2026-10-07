# K04 — Timeline

Product: QuantCooks
Status: EMBEDDED — No dedicated screen — implemented as a panel/component inside another screen.
Priority: P2
Route: (panel in /editor)

## Purpose

Inventory intent: the timeline as its own surface. Implemented as the editor's core panel.

## Data contract

- API: `same layer APIs as K03`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Same as K03.

## Reality

Implemented as `components/Timeline.tsx` embedded in `/editor` — no standalone route, by design.

