# Quant Memory Storage & Indexing

## Canonical storage

Structured memory records live in an authoritative governed data store. Graph data, metadata, provenance, lifecycle, and policy references remain queryable without relying on embeddings.

## Indexes

- lexical index for exact concepts
- vector index for semantic retrieval
- graph index for relationships
- temporal indexes for recency/episodes
- source-reference indexes for provenance/deletion

## Vector rule

Vector indexes are disposable derived indexes. They can be rebuilt from canonical memory records.

## Encryption

Memory data uses encryption and key separation appropriate to sensitivity. Highly sensitive memory requires stronger access boundaries and narrower service identities.

## Cache

Caches are bounded and TTL-controlled. Cached memory must inherit the same authorization constraints as canonical retrieval.
