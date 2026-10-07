# C03 — Group Chat

Product: QuantChat
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P1
Route: /chat/[id] (group threads)

## Purpose

Group conversation: multi-participant thread with shared membership.

## Data contract

- API: `GET /api/conversations/[id]/messages`
- API: `POST /api/conversations/[id]/messages`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Group membership gates read/post. Membership changes audited.

## Reality

No dedicated group-management screen. Group threads render inside the 1:1 thread route (`src/app/chat/[id]/page.tsx` resolves group names in the header). `components/GroupChat.tsx` and `GroupInfo.tsx` exist as components but are not wired to a dedicated route.

## Ambiguity

Inventory lists Group as a separate screen; the code implements groups as thread variants, not a screen.

