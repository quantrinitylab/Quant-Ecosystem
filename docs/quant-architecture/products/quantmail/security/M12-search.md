# M12 — Search Security

## Threats
- index leakage
- stale permission projection
- deleted data resurrection
- cross-tenant retrieval
- semantic embedding leakage
- malicious query abuse
- search side channels

## Controls
- source authorization before indexing
- tenant/user scoped projections
- canonical authorization on sensitive fetch
- bounded snippets
- secure index deletion
- vector deletion on source restriction
- query rate limits and abuse controls
- encrypted transport/storage
- audit security-sensitive search operations

Search is an acceleration layer, never the authorization boundary.
