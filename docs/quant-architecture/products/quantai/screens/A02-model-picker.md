# A02 — Model Picker

Product: QuantAI
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /models (pages router); embedded in / chat header

## Purpose

Choose the model for a chat; browse the model directory.

## Data contract

- API: `GET /api/models`
- API: `POST /api/models/compare (backend exists)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Authenticated users. Model availability may be entitlement-gated.

## Core interactions

- model directory browse
- one-tap switch in chat header

## Reality

Implemented twice: embedded `ModelSelector` + `useModelSelector` in the chat header, and a dedicated `/models` directory page. `/api/models/compare` exists but no compare UI was found.

## Ambiguity

A09 (Model Playground) vs A02: the /models page is a directory, not a playground.

