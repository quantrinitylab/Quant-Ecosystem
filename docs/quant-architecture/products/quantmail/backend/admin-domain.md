# M11 Backend — Admin Domain

## Mail Admin owns

- accepted domains
- mail routing policy
- mailbox policy
- aliases
- groups
- signatures/policy defaults
- retention configuration
- mail quotas
- delivery controls
- mail security settings
- mail-specific audit views

## Does not own

- user authentication
- global organization membership
- platform billing
- Drive permissions
- Calendar policy
- Quanty platform capability policy

## Command boundary

Every admin mutation has:
- actor
- organization
- scope
- command
- expected version
- reason where required
- idempotency key

Admin APIs fail closed when organization or scope is ambiguous.
