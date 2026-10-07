# QuantMail M06 Calendar Context — Testing

## Unit

- event correlation
- timezone handling
- confidence mapping
- invitation extraction
- conflict representation

## Integration

- Calendar authorization
- event lookup
- RSVP command
- create-from-message
- Calendar event invalidation
- provider invitation idempotency

## E2E

1. open invitation
2. inspect event
3. RSVP
4. verify Calendar state
5. return to thread
6. create event from ordinary message
7. simulate conflict
8. simulate Calendar outage

## Security

- unauthorized event
- cross-user calendar access
- delegated mailbox/calendar
- malicious invitation content

## Completion

Mail must never become a shadow calendar database.
