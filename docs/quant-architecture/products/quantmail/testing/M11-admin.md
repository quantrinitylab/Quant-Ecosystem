# M11 — Admin Testing

## Unit

- role/capability mapping
- organization scope
- version conflicts
- impact calculation
- idempotency
- audit generation

## Integration

- identity role resolution
- domain verification
- mailbox lifecycle
- aliases
- groups
- policies
- retention
- quotas
- security controls
- audit pipeline

## Security

- horizontal privilege escalation
- organization crossover
- role confusion
- stale policy overwrite
- bulk mutation abuse
- audit bypass
- secret exposure
- suspended mailbox access
- Quanty privilege escalation

## E2E

1. authorized admin opens dashboard
2. unauthorized user denied
3. create domain
4. verify domain
5. create alias
6. change policy
7. preview bulk operation
8. execute approved operation
9. inspect audit
10. verify event propagation
