# Operational Runbook

## Health Checks

Every service exposes a `/health` endpoint. Monitor these for service availability.

| Service        | URL                             | Port | Healthy Response            |
| -------------- | ------------------------------- | ---- | --------------------------- |
| ws-gateway     | `http://<host>:3040/health`     | 3040 | `{ "status": "ok" }`        |
| search-indexer | `http://<host>:3022/health`     | 3022 | `{ "status": "ok" }`        |
| quantmail      | `http://<host>:3010/api/health` | 3010 | `{ "status": "ok" }`        |
| quantchat      | `http://<host>:3015/api/health` | 3015 | `{ "status": "ok" }`        |
| quantai        | `http://<host>:3020/api/health` | 3020 | `{ "status": "ok" }`        |
| admin          | `http://<host>:3100/api/health` | 3100 | `{ "status": "ok" }`        |
| PostgreSQL     | Docker healthcheck              | 5432 | `pg_isready -U quant`       |
| Redis          | Docker healthcheck              | 6379 | `redis-cli ping` -> `PONG`  |
| Meilisearch    | `http://<host>:7700/health`     | 7700 | `{ "status": "available" }` |

### Automated Health Monitoring

The `@quant/observability` package provides a `HealthChecker` class:

```typescript
import { HealthChecker } from '@quant/observability';

const health = new HealthChecker();
health.register('postgres', async () => {
  /* check */
});
health.register('redis', async () => {
  /* check */
});
health.register('kafka', async () => {
  /* check */
});

const result = await health.checkAll();
// { status: 'healthy' | 'degraded' | 'unhealthy', checks: [...] }
```

---

## Monitoring

### OpenTelemetry Setup

The `@quant/observability` package provides full OTel integration:

```typescript
import { OTelSetup, initTracing, initMetrics, createLogger } from '@quant/observability';

// Initialize tracing (sends to Jaeger at OTEL_EXPORTER_OTLP_ENDPOINT)
initTracing({
  serviceName: 'quantmail',
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
});

// Initialize metrics (Prometheus format at /metrics)
initMetrics({ serviceName: 'quantmail' });

// Structured logging
const logger = createLogger({ service: 'quantmail', level: 'info' });
```

### Prometheus Metrics

Metrics are exposed on each service's health port at `/metrics`. Key metrics:

| Metric                          | Type      | Description                                           |
| ------------------------------- | --------- | ----------------------------------------------------- |
| `http_requests_total`           | Counter   | Total HTTP requests by method, path, status           |
| `http_request_duration_seconds` | Histogram | Request latency distribution                          |
| `ws_connections_active`         | Gauge     | Current WebSocket connections                         |
| `kafka_consumer_lag`            | Gauge     | Consumer lag by topic/partition                       |
| `db_query_duration_seconds`     | Histogram | Database query latency                                |
| `cache_hit_ratio`               | Gauge     | Redis cache hit/miss ratio                            |
| `circuit_breaker_state`         | Gauge     | Circuit breaker state (0=closed, 1=open, 2=half-open) |

### Grafana Dashboards

Pre-configured dashboards in `infra/grafana/`:

- **Platform Overview**: Request rate, error rate, latency P50/P95/P99
- **Service Health**: Per-service CPU, memory, restart count
- **Database**: Query latency, connection pool, replication lag
- **Kafka**: Consumer lag, throughput, partition distribution
- **WebSocket**: Connection count, message rate, disconnection reasons

### Alert Rules

The `AlertRuleGenerator` in `@quant/observability` generates Prometheus alerting rules:

```yaml
# Critical alerts
- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
  for: 2m
  labels:
    severity: critical

- alert: DatabaseConnectionPool
  expr: pg_pool_available_connections < 5
  for: 1m
  labels:
    severity: warning

- alert: KafkaConsumerLag
  expr: kafka_consumer_lag > 10000
  for: 5m
  labels:
    severity: warning
```

---

## Common Issues and Fixes

### Database Connection Issues

**Symptom**: `ECONNREFUSED` or `too many connections` errors

**Diagnosis**:

```bash
# Check connection count
docker exec postgres psql -U quant -c "SELECT count(*) FROM pg_stat_activity;"

# Check for long-running queries
docker exec postgres psql -U quant -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 10;"
```

**Fix**:

1. Check `DATABASE_URL` environment variable is correct
2. Increase `max_connections` in PostgreSQL config (default: 100)
3. Review connection pool settings in Prisma (`connection_limit` in URL)
4. Kill long-running queries: `SELECT pg_terminate_backend(<pid>);`

### Redis Memory Issues

**Symptom**: `OOM` errors, degraded cache performance

**Diagnosis**:

```bash
# Check memory usage
docker exec redis redis-cli INFO memory

# Check key count by pattern
docker exec redis redis-cli --scan --pattern 'session:*' | wc -l
docker exec redis redis-cli --scan --pattern 'rate-limit:*' | wc -l
```

**Fix**:

1. Redis is configured with `maxmemory 256mb` and `allkeys-lru` eviction
2. Increase `maxmemory` if needed: `redis-cli CONFIG SET maxmemory 512mb`
3. Check for key leaks (sessions not expiring): review TTL settings
4. Flush specific patterns if needed: `redis-cli --scan --pattern 'temp:*' | xargs redis-cli DEL`

### Kafka Consumer Lag

**Symptom**: search-indexer falling behind, stale search results

**Diagnosis**:

```bash
# Check consumer group lag
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group search-indexer-group
```

**Fix**:

1. **Minor lag (<1000)**: Usually self-resolving, monitor for 5 minutes
2. **Moderate lag (1000-10000)**: Scale search-indexer replicas
3. **Severe lag (>10000)**:
   - Check search-indexer logs for errors
   - Verify Meilisearch/Qdrant are healthy
   - Consider resetting consumer offset: `--reset-offsets --to-latest`
4. **Dead letters accumulating**: Check `outbox.events.dlq` topic for failed events

### Search Index Drift

**Symptom**: Search results inconsistent with database state

**Diagnosis**:

```bash
# Compare document counts
# Meilisearch
curl http://localhost:7700/indexes/emails/stats -H "Authorization: Bearer $MEILI_MASTER_KEY"

# Database
docker exec postgres psql -U quant -c "SELECT COUNT(*) FROM emails;"
```

**Fix**:

1. Trigger full reindex via search-indexer API: `POST http://localhost:3022/reindex`
2. Reset Kafka consumer offset to reprocess events
3. For vector index: embeddings require `EMBEDDING_PROVIDER` to be set

### WebSocket Connection Drops

**Symptom**: Users losing real-time updates, frequent reconnects

**Diagnosis**:

```bash
# Check ws-gateway health
curl http://localhost:3040/health

# Check active connections (via metrics)
curl http://localhost:3040/metrics | grep ws_connections_active
```

**Fix**:

1. Verify `JWT_SECRET` is configured (min 32 chars) - ws-gateway runs in degraded mode without it
2. Check Redis connectivity (used for pub/sub between gateway instances)
3. Review `MAX_CONNECTIONS` limit (default: 10000)
4. Check heartbeat timeout - clients must respond within 60s

---

## Scaling Procedures

### Horizontal Pod Autoscaling

```bash
# View current HPA status
kubectl get hpa -n quant

# Manually scale a deployment
kubectl scale deployment quantmail --replicas=5 -n quant

# Update HPA limits
kubectl patch hpa quantmail-hpa -n quant \
  --patch '{"spec":{"maxReplicas":30}}'
```

### Database Read Replicas

```bash
# Add read replica (Kubernetes)
# Update Helm values:
# postgresql.replication.enabled: true
# postgresql.replication.readReplicas: 2

helm upgrade quant-platform infra/helm/quant-platform \
  --set postgresql.replication.readReplicas=3 -n quant
```

### Redis Cluster Scaling

```bash
# Add Redis node
redis-cli --cluster add-node <new-host>:6379 <existing-host>:6379

# Rebalance slots
redis-cli --cluster rebalance <host>:6379
```

### Kafka Partition Scaling

```bash
# Increase partitions for a topic
kafka-topics.sh --bootstrap-server localhost:9092 \
  --alter --topic outbox.events --partitions 12

# Then scale consumer replicas to match
kubectl scale deployment search-indexer --replicas=12 -n quant
```

---

## Rollback Procedures

### Helm Rollback

```bash
# View release history
helm history quant-platform -n quant

# Rollback to previous revision
helm rollback quant-platform 1 -n quant

# Rollback to specific revision
helm rollback quant-platform 5 -n quant
```

### Feature Flag Kill Switches

For immediate feature disabling without deployment:

```typescript
// Via admin panel API
POST /api/feature-flags
{
  "key": "email-send-enabled",
  "enabled": false
}

// Or via CLI
curl -X PUT http://admin:3100/api/feature-flags/email-send-enabled \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"enabled": false}'
```

### Database Migration Rollback

```bash
# View migration status
pnpm prisma migrate status

# Rollback last migration
pnpm prisma migrate resolve --rolled-back <migration-name>
```

### Docker Compose Rollback

```bash
# Stop current version
docker compose down

# Checkout previous version
git checkout <previous-tag>

# Rebuild and start
docker compose up -d --build
```

---

## Maintenance Windows

### Database Maintenance

```bash
# Vacuum and analyze (run during low traffic)
docker exec postgres psql -U quant -c "VACUUM ANALYZE;"

# Reindex
docker exec postgres psql -U quant -c "REINDEX DATABASE quantdb;"

# Check bloat
docker exec postgres psql -U quant -c "SELECT relname, n_dead_tup FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;"
```

### Log Rotation

Logs are managed by the structured logger in `@quant/observability`:

- Stdout/stderr captured by container runtime
- Jaeger retains traces for 7 days (configurable)
- Prometheus metrics retained for 15 days

### Certificate Renewal

TLS certificates managed by cert-manager in Kubernetes:

```bash
# Check certificate status
kubectl get certificates -n quant

# Force renewal
kubectl delete certificate quant-tls -n quant
# cert-manager will auto-create a new one
```
