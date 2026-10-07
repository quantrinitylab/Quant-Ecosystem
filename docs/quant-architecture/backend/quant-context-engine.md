# Quant Context Engine

## Purpose

Build the smallest useful context package for a current user task.

## Context layers

CURRENT_TASK, SESSION, RECENT_ACTIVITY, ACTIVE_PROJECT, RELEVANT_MEMORY, RELATIONSHIP_CONTEXT, TEMPORARY_SIGNALS, PRODUCT_CONTEXT.

## Context assembly

Intent → required context types → authorization → retrieval → ranking → compression → conflict check → context package.

## Expiry

Each context item has a TTL or lifecycle rule. Temporary context must not silently become durable memory.

## Product isolation

A product receives scoped context. QuantWave's feed request, for example, can request recommendation context without receiving arbitrary private Mail content.

## Context package

contextId, requester, purpose, scope, items, provenance, expiry, policyVersion, generatedAt.

## Failure behavior

If optional context is unavailable, product operation continues with reduced personalization. The system must not fabricate missing context.
