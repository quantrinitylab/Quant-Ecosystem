# M13 Backend — Delivery Domain

## Ownership

Outbound delivery owns:
- prepared MIME
- submission queue
- provider selection
- retries
- delivery state
- bounce/complaint processing
- delivery events

Inbound mail owns:
- SMTP receiving
- validation
- accepted-message persistence
- spam/security handoff
- inbound delivery

Mail thread domain owns conversation/thread truth.

Delivery never directly edits thread presentation state except through typed events.

## State machine

PREPARING -> QUEUED -> SUBMITTED
SUBMITTED -> DELIVERED
SUBMITTED -> DEFERRED -> QUEUED
SUBMITTED -> BOUNCED
SUBMITTED -> FAILED
QUEUED -> CANCELLED

Transitions are validated server-side.
