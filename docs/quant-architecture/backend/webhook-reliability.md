# M23 — Webhook Reliability

## States
PENDING → DELIVERING → DELIVERED or RETRYING → DISABLED.

## Retry
Exponential backoff with jitter, bounded attempts, delivery timeout, and dead-letter handling.

## Reconciliation
Developers can replay eligible events from a controlled retention window. Replay is observable and cannot bypass current authorization.

## Abuse
Protect the platform from slow endpoints, retry amplification, payload abuse, and subscription floods.
