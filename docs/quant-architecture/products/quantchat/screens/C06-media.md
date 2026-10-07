# C06 — Media

Product: QuantChat
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P1
Route: /camera, /stories, /spotlight, /reels

## Purpose

Camera-first media cluster: capture, stories, spotlight discovery, reels viewing.

## Data contract

- API: `GET|POST /api/stories, /api/stories/[storyId]/view, /reply`
- API: `GET /api/spotlight`
- API: `POST /api/media/upload-url, /api/media/upload`
- API: `GET /api/ar-lenses/capabilities`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Story viewers gated by privacy settings (everyone|friends|custom). Uploads require auth.

## Core interactions

- capture (Camera.tsx)
- create story (StoryCreator)
- view stories (StoryViewer)
- spotlight feed
- reels feed
- AR lenses (ARFilters.tsx)

## Reality

Implemented as a cluster: `/camera`, `/stories`, `/spotlight`, `/reels` pages plus `components/Camera.tsx`, `StoryCreator.tsx`, `StoryViewer.tsx`, `ARFilters.tsx`.

## Ambiguity

Inventory one-liner 'Media' underspecifies the scope. The implemented reality is a camera/stories/spotlight/reels cluster — spec'd here as one C06 family.

