# K07 — Render Queue

Product: QuantCooks
Status: PARTIAL — Partially implemented — see Reality note.
Priority: P2
Route: /export (queue embedded)

## Purpose

Render/export job queue: submit, track QUEUED→PROCESSING→COMPLETED/FAILED, download.

## Data contract

- API: `POST /api/exports`
- API: `GET /api/exports/[id]/status`
- API: `POST /api/exports/[id]/cancel`
- API: `GET /api/exports/[id]/download`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Owner-scoped jobs.

## Core interactions

- queue export
- poll status (real, no fake progress)
- cancel
- download

## Reality

Queue UI is embedded in `/export` (page header: 'Exports are queued through the real POST /api/exports endpoint and job status is polled — no fake progress'). No separate queue page.

