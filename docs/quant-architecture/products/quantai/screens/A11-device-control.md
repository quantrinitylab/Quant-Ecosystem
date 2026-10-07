# A11 — Device Control

Product: QuantAI
Status: IMPLEMENTED — Implemented in code (real UI + real data path).
Priority: P2
Route: /device (pages router)

## Purpose

Control paired devices: send commands, view screen.

## Data contract

- API: `GET /api/devices`
- API: `POST /api/devices/[deviceId]/command`
- API: `GET /api/devices/[deviceId]/screen`

## States

- Loading: structural skeleton via `@quant/shared-ui` LoadingState; no fake rows.
- Empty: explicit empty state with a useful next action; never fabricated content.
- Error: ErrorState with retry; network/auth failures surfaced, not swallowed.
- Unauthorized: SignInRequired / auth boundary; session token never rendered in UI.

## Permissions

Only the device owner's paired devices. Commands are capability-scoped.

## Core interactions

- device list (DeviceCard)
- send command
- view device screen

## Reality

Implemented at `src/pages/device.tsx` with `DeviceCard`, backed by device command/screen APIs.

## Evidence

- `apps/quantai/src/pages/device.tsx`

