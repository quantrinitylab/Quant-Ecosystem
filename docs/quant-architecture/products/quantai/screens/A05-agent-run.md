# A05 — Agent Run

Product: QuantAI
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P2
Route: (embedded in chat /code terminal)

## Purpose

Inventory intent: monitor and control running agent tasks.

## Data contract

- API: `GET|POST /api/agents/runtime/tasks`
- API: `GET /api/agents/runtime/tasks/[id]`
- API: `POST /api/agents/browser/sessions`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Users see only their own runs.

## Core interactions

- view run steps/logs
- cancel run

## Reality

Runtime task APIs exist, but no dedicated run-console screen was found. Runs surface inside the chat page via `AgentCodeTerminal` and browser-session endpoints.

