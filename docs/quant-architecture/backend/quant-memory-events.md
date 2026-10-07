# Quant Memory Events

## Events

quant.memory.candidate.created.v1
quant.memory.activated.v1
quant.memory.updated.v1
quant.memory.superseded.v1
quant.memory.expired.v1
quant.memory.deleted.v1
quant.memory.suppressed.v1
quant.memory.source_revoked.v1
quant.memory.index_requested.v1
quant.memory.indexed.v1
quant.memory.retrieval.audit.v1

## Event requirements

Events carry stable IDs, actor/agent identity, source references, schema version, timestamp, correlation ID, and privacy classification. Sensitive payloads are minimized.

## Delivery

At-least-once delivery is expected. Consumers are idempotent. Event replay must respect current authorization and deletion state.
