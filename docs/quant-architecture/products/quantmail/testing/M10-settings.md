# M10 — Settings Testing

## Unit

- registry validation
- type validation
- scope validation
- version conflict
- sensitivity classification
- default resolution

## Integration

- owner-domain routing
- identity step-up
- mail settings
- attention preferences
- Quanty preferences
- device/session APIs
- event propagation

## Security

- cross-user setting access
- organization/user scope confusion
- stale write
- privilege escalation through preference
- secret leakage
- session revocation
- step-up bypass

## E2E

1. read settings catalog
2. update mail preference
3. update notification preference
4. change Quanty memory policy
5. trigger stale-version conflict
6. require step-up
7. revoke device
8. reconnect another client
9. verify propagated state
