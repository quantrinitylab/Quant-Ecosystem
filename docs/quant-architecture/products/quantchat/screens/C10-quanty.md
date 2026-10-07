# C10 — Quanty

Product: QuantChat
Status: EMBEDDED — No dedicated screen — implemented as a panel/component inside another screen.
Priority: P1
Route: (panels in /chat/[id])

## Purpose

Inventory intent: AI assistant inside chat — smart replies, summaries, translation, auto-reply.

## Data contract

- API: `POST /api/ai/auto-reply, /toggle`
- API: `POST /api/ai/summarize`
- API: `POST /api/ai/translate`
- API: `GET /api/ai/suggestions`
- API: `POST /api/ai/schedule`
- API: `POST /api/ai/prioritize-notifications`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Same as the enclosing thread. AI features require explicit user opt-in where configured.

## Core interactions

- reply suggestions (ReplySuggestions)
- agent panel (AIAgentPanel)
- auto-reply toggle
- summarize thread
- translate message

## Reality

No dedicated Quanty page. Implemented as embedded panels/components in the chat thread (`AIAgentPanel.tsx`, `AIAssistant.tsx`, `ReplySuggestions`) backed by `/api/ai/*` routes.

