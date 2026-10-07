# QuantMail M05 People Context — Testing

## Unit

- identity normalization
- contact resolution mapping
- relationship bucket computation
- cache invalidation

## Integration

- Contacts authorization
- event-driven projection refresh
- unknown sender behavior
- dependency outage
- delegated mailbox scope

## E2E

1. open known contact thread
2. inspect context
3. open canonical contact
4. return
5. inspect unknown sender
6. add to Contacts
7. refresh thread
8. simulate Contacts outage

## Security

- cross-user contact leakage
- private field leakage
- delegated access
- stale cache after contact deletion
