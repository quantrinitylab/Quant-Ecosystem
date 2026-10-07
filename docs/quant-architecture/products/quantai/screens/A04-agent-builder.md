# A04 — Agent Builder

Product: QuantAI
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P2
Route: /automation (workflow builder); /code (agent terminal)

## Purpose

Inventory intent: build/configure autonomous agents (goals, tools, code).

## Data contract

- API: `GET /api/agents/runtime/agents`
- API: `POST /api/agents/code/analyze`
- API: `GET /api/agents/swarm/goals`
- API: `POST /api/agents/swarm/goals`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Authenticated users; agent tool grants are explicit.

## Core interactions

- node-based automation canvas (/automation)
- agent code terminal (/code, AgentCodeTerminal)
- swarm goals CRUD

## Reality

No dedicated 'agent builder wizard'. Agent-building capability is split across: `/automation` (visual node builder with statuses idle|running|success|error), `/code` (AgentCodeTerminal), and swarm-goals APIs. Usable but not unified as A04 implies.

