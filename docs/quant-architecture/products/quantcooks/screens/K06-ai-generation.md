# K06 — AI Generation

Product: QuantCooks
Status: EMBEDDED — No dedicated screen — implemented as a panel/component inside another screen.
Priority: P2
Route: (AITools panel in /editor)

## Purpose

AI editing assists: edit, upscale, captions, background removal, suggestions.

## Data contract

- API: `POST /api/ai/edit`
- API: `POST /api/ai/upscale`
- API: `POST /api/ai/captions`
- API: `POST /api/ai/background-remove`
- API: `POST /api/ai/suggest`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Project members; AI usage metered per user.

## Core interactions

- pick tool
- apply to clip
- preview result
- accept/discard

## Reality

Implemented as `components/AITools.tsx` panel inside `/editor`, backed by /api/ai/*.

