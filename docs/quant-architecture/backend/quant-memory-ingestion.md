# Quant Memory Ingestion

## Pipeline

Source event → normalize → classify → extract candidate facts/episodes/entities → sensitivity classification → deduplicate → confidence scoring → policy evaluation → persist candidate/active memory → index → emit memory event.

## Sources

Mail, Calendar, Drive, Contacts, QuantGit, QuantChat, QuantGram, QuantWave, QuantTube, QuantMax, QuantCooks, and approved platform activity can contribute signals according to product contracts.

## Ingestion rule

Products emit typed events. Memory consumes events; it does not crawl product databases arbitrarily.

## Content minimization

Extract only information needed for the memory purpose. Do not permanently retain entire source bodies as a shortcut for future recall.

## Idempotency

Each source event has a stable event ID. Duplicate delivery must not create duplicate memory records.

## Deletion propagation

When a source object is deleted or a memory permission is revoked, dependent memory candidates, embeddings, graph edges, and derived indexes enter their declared deletion workflow.
