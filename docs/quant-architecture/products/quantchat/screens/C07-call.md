# C07 — Call

Product: QuantChat
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P0
Route: /call, /calls (history)

## Purpose

1:1 voice/video calls with in-call controls and call history.

## Data contract

- API: `call state via `src/services/api-client``
- API: `WebRTC in client (`components/VideoCall.tsx`, `CallControls.tsx`)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Calls only between contacts per privacy settings (whoCanMessage).

## Core interactions

- start audio/video call
- mute, speaker, camera toggle
- end call
- call history

## Reality

Implemented: `/call` page with `CallControls` + `VideoCall`, and `/calls` (pages router) history page using `useCallState`/`useCallTimer`. WebRTC signaling in client.

