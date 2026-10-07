# M19 — Production Deployment Observability

Every release carries a version/build identifier through logs, metrics, and traces.

## Required views
- release health
- API latency/error
- database health
- queue age/lag
- search health
- websocket connections
- attachment throughput
- mail delivery
- security events
- infrastructure saturation

## Correlation
Request, job, event, and deployment identifiers enable cross-service diagnosis without logging private message bodies or credentials.

Deployment dashboards must distinguish application regression from dependency failure.
