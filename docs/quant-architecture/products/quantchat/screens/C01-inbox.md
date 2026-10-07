# C01 — Inbox

Product: QuantChat
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /

## Purpose

Conversation list — the primary QuantChat entry point. Answers: who messaged, what is unread, which thread to open.

## Data contract

- API: `GET /api/conversations`
- API: `GET /api/presence`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Authenticated Quant Account only. Users see only conversations they belong to; presence scoped to contacts.

## Core interactions

- open thread -> /chat/[id]
- new chat -> /new-chat
- filter/search within list (client-side)

## Reality

Implemented at `src/app/page.tsx` via `useConversations`. Renders loading skeleton, empty state, and error state from `@quant/shared-ui`. Realtime updates via chat socket hooks.

## Evidence

- `apps/quantchat/src/app/page.tsx`
- `apps/quantchat/src/hooks/useConversations.ts`

