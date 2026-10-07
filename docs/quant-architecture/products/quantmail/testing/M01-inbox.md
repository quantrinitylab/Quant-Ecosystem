# QuantMail M01 Inbox — Testing

## Unit

- row state mapping
- cursor serialization
- payload validation
- error mapping
- mode filters
- optimistic rollback

## API integration

- deterministic ordering
- cursor continuation without duplicates
- correct read/star/archive events
- version conflict
- unauthorized resource access
- projection catches up after outbox delivery

## Browser E2E

Journey:
1. authenticate
2. open QuantMail
3. load inbox
4. open thread
5. return
6. mark read
7. star
8. archive
9. verify list update
10. refresh
11. verify persistence

Failure journeys:
- expired authentication
- 500
- slow network
- empty mailbox
- stale version
- context dependency outage

## Mobile E2E

- launch
- shell integrity
- scroll
- swipe + button equivalent
- open thread
- back
- rotation/state restore where supported
- offline cached rendering

## Visual regression

Capture:
- loading
- empty
- normal
- unread-heavy
- selected
- context rail
- 390px
- 768px
- 1440px

## Security

- cross-user thread access
- delegated mailbox boundaries
- role boundaries
- logout cache clearing
- sensitive data absent from logs

## Completion gate

M01 is complete only when:
- implementation tests pass
- browser/device evidence exists
- accessibility checks pass
- real backend is used
- mock/fake data is absent from the live path
- one user action can be traced end to end
