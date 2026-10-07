# M16 — Dependency Health

Dependencies:
- PostgreSQL
- Redis
- Kafka/event relay
- search index
- Qdrant
- object storage
- SMTP/provider
- IMAP/provider
- Calendar
- Drive
- Contacts
- Quanty runtime

For each dependency track:
- health
- latency
- error rate
- timeout rate
- circuit state
- last successful operation

A dependency failure must have a declared degraded-mode behavior.
