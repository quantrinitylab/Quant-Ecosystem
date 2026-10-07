# QuantMail M04 Search — Testing

## Unit

- query normalization
- filter serialization
- result normalization
- cursor validation
- domain status mapping

## Integration

- mail result authorization
- cross-domain aggregation
- partial failure
- index freshness
- deletion propagation
- permission filter correctness

## E2E

1. open search
2. query across all domains
3. open mail result
4. return to search
5. filter unread
6. search a person
7. search a file
8. simulate one domain outage
9. retry failed domain
10. deep-link result

## Security

- cross-user leakage attempts
- deleted object leakage
- delegated mailbox
- tenant separation
- unauthorized result from index

## Performance

Measure:
- input-to-results latency
- fan-out duration
- index query latency
- merge/rank duration
- partial failure recovery
