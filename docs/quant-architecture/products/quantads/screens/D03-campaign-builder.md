# D03 — Campaign Builder

Product: QuantAds
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /create-campaign (pages router)

## Purpose

Guided campaign creation: objective, budget, audience, creative, review, launch.

## Data contract

- API: `POST /api/campaigns`
- API: `GET /api/targeting/* (interests, behaviors, estimate)`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Org members with create permission.

## Core interactions

- step wizard
- audience estimate
- budget validation
- review + launch

## Reality

Implemented at `src/pages/create-campaign.tsx` (pages router) on campaigns + targeting APIs.

## Ambiguity

The builder lives in the legacy pages router while /campaigns is app-router — one product, two routers.

