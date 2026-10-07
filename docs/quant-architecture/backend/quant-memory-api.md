# Quant Memory API Contract

## Read

GET /v1/memory/search
GET /v1/memory/{memoryId}
GET /v1/memory/{memoryId}/provenance
GET /v1/memory/graph
POST /v1/memory/context

## User control

POST /v1/memory/{memoryId}/feedback
POST /v1/memory/{memoryId}/correct
POST /v1/memory/{memoryId}/forget
POST /v1/memory/{memoryId}/suppress
POST /v1/memory/{memoryId}/expiry

## Internal lifecycle

POST /internal/v1/memory/candidates
POST /internal/v1/memory/reindex
POST /internal/v1/memory/source-revoked

## Response envelope

Every retrieval response includes requestId, contextId where applicable, bounded records, provenance summary, freshness metadata, policy outcome, and truncation status.

## Security

Never accept source-product permissions from client input. Product/agent identity comes from authenticated capability context.
