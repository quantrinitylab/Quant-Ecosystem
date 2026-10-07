# D02 — Campaigns

Product: QuantAds
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /campaigns

## Purpose

Campaign list: status, spend, performance; pause/delete/edit entry points.

## Data contract

- API: `GET|POST /api/campaigns`
- API: `GET|PATCH|DELETE /api/campaigns/[id]`
- API: `POST /api/campaigns/[id]/status`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Org members with campaign role.

## Core interactions

- status toggle
- edit
- delete (confirm)
- open builder

## Reality

Implemented at `src/app/campaigns/page.tsx` with react-query, CampaignCard actions, status badges.

## Evidence

- `apps/quantads/src/app/campaigns/page.tsx`

