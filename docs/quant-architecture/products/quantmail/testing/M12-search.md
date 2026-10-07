# M12 — Search Testing

## Unit
- query normalization
- parser
- filters
- ranking
- dedupe
- cursor
- authorization projection
- freshness state

## Integration
- DB/outbox
- CDC relay
- lexical index
- vector index
- deletion
- reindex
- partial source failure

## Security
- cross-user/tenant leakage
- unauthorized snippets
- deleted-object resurrection
- restricted embedding retrieval
- forged index event
- stale authorization

## Performance
Measure p50/p95/p99 query latency, indexing lag, deletion propagation, reindex throughput, vector retrieval latency and result-count accuracy.

## E2E
create mail -> index -> exact search -> typo -> semantic -> update -> delete -> verify deletion -> permission change -> verify inaccessible result disappears.
