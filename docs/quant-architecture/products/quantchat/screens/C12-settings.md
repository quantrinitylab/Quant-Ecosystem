# C12 — Settings

Product: QuantChat
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /settings (pages router), panels in /profile

## Purpose

Account, privacy, and notification preferences.

## Data contract

- API: `GET|PATCH /api/settings`
- API: `GET|PATCH /api/settings/account`
- API: `POST|DELETE /api/settings/blocked/[userId]`
- API: `GET /api/settings/export`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

User can only change their own settings.

## Core interactions

- privacy audience pickers
- notification settings
- block/unblock
- export data

## Reality

Implemented: `/settings` (pages router) with privacy settings; `NotificationSettings.tsx` panel; settings panels also surface inside `/profile`. Backed by `/api/settings/*`.

