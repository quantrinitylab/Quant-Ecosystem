# D04 — Creative

Product: QuantAds
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /creatives (app); /creative-studio (pages router)

## Purpose

Ad creative library + studio: upload, edit, AI suggestions.

## Data contract

- API: `GET|POST /api/creatives`
- API: `GET|PATCH|DELETE /api/creatives/[id]`
- API: `POST /api/ai/creative-suggestions`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Org-scoped.

## Core interactions

- upload creative
- AI suggestions
- approve/reject workflow entry

## Reality

Implemented: `/creatives` (app router) list + `/creative-studio` (pages router) editor, on creatives API + AI suggestions.

