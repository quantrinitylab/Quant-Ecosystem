# Economy Admin Domain

Economy Admin owns operational configuration and financial workflow within Economy.

It does not own:
- identity
- product moderation
- mail policy
- content policy
- security incident response

Every mutation is scoped to organization/account where applicable and records actor, role, reason, previous state, resulting state, correlation ID, and policy version.
