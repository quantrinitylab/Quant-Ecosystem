# M13 — Delivery Testing

## Unit
- state transitions
- SMTP response classification
- retry policy
- idempotency
- message/thread identity
- bounce classification
- authentication result parsing

## Integration
- outbound provider
- inbound SMTP
- IMAP sync
- queue
- delivery event ingestion
- DKIM signing boundary
- DNS verification
- attachment scan handoff

## Failure
- timeout after submission
- duplicate event
- provider outage
- permanent bounce
- temporary defer
- IMAP UIDVALIDITY change
- reconnect
- downstream service outage

## Security
- credential leakage
- unauthorized send
- spoofed provider event
- DKIM key exposure
- recipient enumeration
- rate-limit bypass
- cross-tenant delivery

## E2E
1. compose
2. prepare
3. confirm
4. queue
5. submit
6. reconcile provider state
7. receive delivery/bounce
8. verify thread state
9. retry transient failure
10. prove duplicate send prevention
