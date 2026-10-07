# C02 — 1:1 Chat

Product: QuantChat
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /chat/[id]

## Purpose

One-to-one (and small group) thread: send/receive text, media, voice; receipts; reactions; replies; AI assistance.

## Data contract

- API: `GET /api/conversations/[id]/messages`
- API: `POST /api/conversations/[id]/messages`
- API: `GET|PATCH /api/messages/[id]`
- API: `WS via useChatSocket/useRealtimeChat`
- API: `GET|POST /api/e2ee/keys, /api/e2ee/prekeys, /api/e2ee/messages (crypto primitives)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Only conversation members can read/post. Sender display names and content are untrusted.

## Core interactions

- send text/media/voice
- reactions (ReactionPicker)
- reply-to
- disappearing timer
- read receipts (ReadReceipts.tsx)
- typing indicator
- AI reply suggestions
- link previews

## Reality

Deeply implemented at `src/app/chat/[id]/page.tsx` with realtime socket, optimistic send, delivery/read statuses, reactions, voice notes, disappearing messages, link previews. E2EE key/prekey/message endpoints and client encryption components exist (`components/encryption`, E2EEncryption.tsx), but default-on E2EE for 1:1 threads is NOT verified — spec the crypto boundary as aspirational until proven.

## Ambiguity

Inventory says '1:1'; the same route also renders group threads (group name resolution in header).

## Evidence

- `apps/quantchat/src/app/chat/[id]/page.tsx`
- `apps/quantchat/src/hooks/useChatSocket.ts`

