# C05 — Channel

Product: QuantChat
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P1
Route: /channels

## Purpose

Broadcast channels: one-to-many publishing with subscribe/unsubscribe.

## Data contract

- API: `GET /api/channels`
- API: `GET /api/channels/[id]/messages`
- API: `POST /api/channels/[id]/publish`
- API: `POST /api/channels/[id]/subscribe`
- API: `POST /api/channels/[id]/unsubscribe`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Only channel publishers can publish; anyone (per channel policy) can subscribe.

## Core interactions

- browse channels
- subscribe/unsubscribe
- read channel messages
- publish (publisher only)

## Reality

Implemented at `src/app/channels/page.tsx` via `useChannels`, backed by full channel API routes.

## Evidence

- `apps/quantchat/src/app/channels/page.tsx`
- `apps/quantchat/src/hooks/useChannels.ts`

