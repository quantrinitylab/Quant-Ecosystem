# G02 — Stories

Product: QuantGram
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /stories, /story-viewer

## Purpose

Ephemeral 24h stories with viewer list and replies.

## Data contract

- API: `GET|POST /api/stories`
- API: `POST /api/stories/[storyId]/view`
- API: `POST /api/stories/[storyId]/reply`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Viewers gated by author's story privacy (everyone|friends|close friends).

## Core interactions

- stories bar
- tap to view (story-viewer)
- reply to story
- view counts (author only)

## Reality

Implemented: `/stories` list + `/story-viewer` route, backed by stories API (view/reply).

