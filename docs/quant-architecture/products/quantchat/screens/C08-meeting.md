# C08 — Meeting

Product: QuantChat
Status: MISSING — Not implemented — inventory screen with no corresponding UI in the repo.
Priority: P1
Route: (none)

## Purpose

Inventory intent: multi-party meetings (QuantMeet) — lobby, stage, screen share, recording.

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

`/call` is 1:1 only. No meeting lobby/join/stage exists. The target state is fully specified in `products/quantchat/07-screen-deep-dive-c08-quantmeet.md` and `17-webrtc-sfu-quantmeet-media-architecture.md` — use them as the build spec.

