# M23 — Webhooks

## Model
Product event → authorized webhook subscription → delivery queue → signed HTTP delivery → retry/reconciliation.

## Security
- endpoint ownership verification
- HTTPS required
- signed payloads
- timestamp/replay protection
- secret rotation
- scoped event subscriptions

## Delivery
At-least-once delivery is expected. Every event has a stable event ID and consumers must deduplicate.

Webhook delivery never changes the source-of-truth state.
