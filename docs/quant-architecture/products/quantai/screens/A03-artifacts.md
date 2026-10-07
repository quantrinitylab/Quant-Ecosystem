# A03 — Artifacts

Product: QuantAI
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /artifacts

## Purpose

Saved AI outputs (documents, code, images) as persistent, editable artifacts.

## Data contract

- API: `GET|POST /api/quanty/artifacts`
- API: `GET|PATCH|DELETE /api/quanty/artifacts/[id]`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User-scoped; shared artifacts require explicit share grant.

## Core interactions

- open artifact
- edit/version
- export
- delete

## Reality

Implemented at `src/app/artifacts/page.tsx` with `CanvasArtifactsPanel`, backed by /api/quanty/artifacts.

