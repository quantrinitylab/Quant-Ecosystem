# X05 — Chat Handoff

Product: QuantMax
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P2
Route: (no standalone chat screen)

## Purpose

Inventory intent: move a match into conversation (chat handoff, likely into QuantChat).

## Data contract

- API: `POST /api/group-rooms/[roomId]/chat (in-room text chat)`
- API: `POST /api/videochat/join`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Match/group participants only.

## Reality

No standalone chat screen. Text chat exists only inside group rooms (`POST /group-rooms/[id]/chat` via api-client) and videochat pairing. The handoff into QuantChat implied by the inventory name is not implemented.

## Ambiguity

Inventory 'Chat Handoff' implies a bridge to QuantChat; the code has in-room chat only.

