# M13 — Mail Delivery & Protocol Infrastructure

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Surfaces

- Outbox/send status
- Delivery details
- Bounce/complaint details
- Domain health
- IMAP sync status
- Connection/provider diagnostics
- Security/authentication status

## User-visible delivery states

DRAFT
PREPARING
QUEUED
SUBMITTED
DELIVERED
DEFERRED
BOUNCED
FAILED
CANCELLED

A UI never maps QUEUED directly to DELIVERED.

## Delivery detail

Show:
- message/thread
- recipient
- current state
- timestamps
- provider-neutral reason
- authentication result where appropriate
- retry status

Never expose provider credentials or internal infrastructure identifiers.

## Evidence

- successful send
- temporary provider failure
- permanent bounce
- recipient rejection
- duplicate-send prevention
- inbound message
- IMAP reconnect
- DKIM/SPF/DMARC result
- abuse/rate limit
