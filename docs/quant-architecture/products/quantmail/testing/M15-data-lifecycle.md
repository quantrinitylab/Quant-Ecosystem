# M15 — Data Lifecycle Testing

## Unit
- retention eligibility
- policy version resolution
- hold matching
- deletion state machine
- export scope
- expiry
- idempotency

## Integration
- Mail source
- Drive/object storage
- search
- Qdrant/vector
- notifications
- cache invalidation
- audit

## Security
- cross-user export
- cross-tenant export
- unauthorized deletion
- hold bypass
- stale download capability
- deleted-data resurrection
- audit tampering

## E2E
1. request export
2. authorize
3. prepare
4. download
5. expire
6. request deletion
7. apply hold
8. verify deletion blocked
9. release hold
10. erase
11. verify derived cleanup
12. verify audit trail
