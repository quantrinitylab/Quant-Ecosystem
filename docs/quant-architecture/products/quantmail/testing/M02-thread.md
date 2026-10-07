# QuantMail M02 Thread — Testing

## Unit

- message ordering
- quoted-content detection
- participant rendering
- security classification mapping
- attachment metadata mapping
- draft handoff

## Integration

- authorized thread retrieval
- body sanitization
- attachment authorization
- thread mutation persistence
- outbox event publication
- calendar/drive command boundary

## E2E

1. open thread from inbox
2. verify latest message
3. expand historical message
4. open attachment metadata
5. return to inbox
6. draft reply
7. simulate send failure
8. verify draft survives
9. retry
10. verify outbound event

Security scenarios:
- malicious HTML
- external sender warning
- unauthorized attachment
- cross-user thread ID
- session expiration

## Device matrix

Web:
- 1440px
- 1024px
- 390px

Flutter:
- Android narrow
- Android large
- iOS narrow
- iOS large

Completion requires real backend evidence and zero fabricated message data.
