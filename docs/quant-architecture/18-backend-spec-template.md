# 18 — Backend Specification Template

Every domain backend receives a written contract before deep implementation.

## Domain
Owner, responsibilities, invariants and source-of-truth entities.

## Data model
Entities, keys, relationships, indexes, retention and migration.

## Commands
Authorization, validation, idempotency, transaction boundary, side effects, events and failure behavior.

## Queries
Authorization, consistency, pagination, filtering, caching and timeout.

## Events
Producer, schema, version, ordering, retry and consumers.

## Workflow
State machine, compensation, timeout, retry and recovery.

## Security
Tenant isolation, secrets, abuse limits, audit and sensitive fields.

## Observability
Metrics, traces, logs, SLO and alerts.

## Testing
Unit, integration, contract, failure-injection and migration tests.

## Deployment
Config, dependencies, health checks, rollout, rollback and migration safety.