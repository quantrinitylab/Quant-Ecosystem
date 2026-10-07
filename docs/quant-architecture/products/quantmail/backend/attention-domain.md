# M09 Backend — Attention Domain

## Ownership

Attention owns:
- user attention items
- deduplication
- grouping
- read/unread state
- resolution state
- delivery preferences
- user notification policy

Attention does not own:
- Mail message state
- Calendar event state
- Drive permission truth
- Git review truth
- Quanty task truth

## Ingestion

Sources publish typed events.

Attention:
1. authenticates event producer
2. validates schema/version
3. derives attention candidate
4. checks policy
5. computes dedupe key
6. upserts item
7. emits delivery work
8. records audit metadata

## Idempotency

Event ID plus source version and deterministic dedupe key prevent duplicate attention items.

## Resolution

Resolution is separate from read state.

An item can be read but unresolved.

Example:
- user reads "reply requested"
- task remains unresolved until reply is sent or explicitly dismissed where policy allows

## Retention

Attention records have configurable retention.
Security events may require longer retention according to security policy.
