# K03 — Editor

Product: QuantCooks
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /editor

## Purpose

Multi-track timeline editor: clips, layers, effects, properties, preview.

## Data contract

- API: `GET|PATCH /api/projects/[id]/layers`
- API: `POST /api/projects/[id]/layers/reorder`
- API: `GET|PATCH|DELETE /api/projects/[id]/layers/[layerId]`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Project owner/collaborators.

## Core interactions

- timeline scrub
- clip trim/split
- layer reorder
- effects (EffectsPanel)
- properties edit
- preview playback (PreviewPlayer)
- AI tools (AITools panel)
- export dialog

## Reality

Implemented at `src/pages/editor.tsx` ('QuantEdits'): toolbar, multi-track timeline, playback controls, properties panel, preview. Timeline (K04) and AI generation (K06) are EMBEDDED panels here, not separate screens.

## Evidence

- `apps/quantcooks/src/pages/editor.tsx`
- `apps/quantcooks/src/components/Timeline.tsx`

