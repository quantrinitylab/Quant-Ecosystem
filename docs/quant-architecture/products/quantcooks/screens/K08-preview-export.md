# K08 — Preview/Export

Product: QuantCooks
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /export

## Purpose

Preview the final cut and configure + submit the export (format, quality, platform presets).

## Data contract

- API: `same export APIs as K07`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Project members.

## Core interactions

- preview playback (PreviewPlayer)
- format/quality/resolution pickers
- platform presets
- submit to queue

## Reality

Implemented at `src/pages/export.tsx` with `ExportDialog` + `PreviewPlayer`.

