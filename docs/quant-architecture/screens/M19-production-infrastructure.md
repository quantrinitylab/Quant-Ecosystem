# M19 — QuantMail Production Infrastructure

## Goal
Define a production topology that can be deployed repeatedly, observed, upgraded, and recovered without changing product ownership.

## Environments
- local: developer-owned, disposable
- preview: isolated change validation
- staging: production-like integration
- production: customer traffic
- disaster-recovery: recovery validation and controlled failover

Environment configuration is externalized; secrets never live in source control.

## Production layers
Edge/CDN → ingress/WAF → API/WebSocket gateways → product services → queues/workers → PostgreSQL/Redis/Kafka/search/object storage → external mail providers.

## Principles
- stateless services scale horizontally
- durable state has explicit HA and backup strategy
- workers are independently scalable
- internal traffic uses authenticated service identity
- every critical dependency has health and degraded-mode behavior
