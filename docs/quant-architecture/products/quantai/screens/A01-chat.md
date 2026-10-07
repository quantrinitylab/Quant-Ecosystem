# A01 — Chat

Product: QuantAI
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /

## Purpose

Core AI chat: streaming responses across 7 models, conversation history, personas.

## Data contract

- API: `POST /api/ai/stream (SSE)`
- API: `GET|POST /api/assistant/conversations`
- API: `GET|PATCH|DELETE /api/assistant/conversations/[id]`
- API: `POST /api/assistant/chat`
- API: `GET /api/models`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Authenticated users; conversations are user-scoped.

## Core interactions

- stream chat (ChatStream)
- model switch (ModelSelector)
- persona pick (PersonaSelector)
- new/rename/delete conversation
- voice input (/voice)

## Reality

Implemented at `src/app/page.tsx` with SSE streaming, conversation CRUD, model + persona selectors embedded in the header. `/ask` is a second chat entry point.

## Evidence

- `apps/quantai/src/app/page.tsx`
- `apps/quantai/src/components/ChatStream.tsx`

