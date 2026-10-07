# High Latency Runbook

## Description

Response latency for the service has exceeded acceptable thresholds (p95 > 200ms or p99 > 500ms).

## Severity

Warning

## Impact

Users may experience slow page loads, timeouts, or degraded experience when interacting with the service.

## Detection

- Alert triggered when p95 latency exceeds 200ms or p99 exceeds 500ms
- Monitor the request duration metrics
- Check the service latency panel on the dashboard

## Investigation Steps

1. Identify slow endpoints: check latency breakdown by route
2. Check database query performance: `SELECT * FROM pg_stat_activity WHERE state = 'active'`
3. Review CPU and memory utilization for service pods
4. Check for connection pool exhaustion
5. Verify network latency between services

## Remediation Steps

1. Scale horizontally if CPU-bound: `kubectl scale deployment/<service> --replicas=<N>`
2. Optimize slow database queries (add indexes, rewrite queries)
3. Enable or tune caching layers
4. Increase connection pool size if pool exhaustion detected
5. Consider rate limiting if traffic spike is the cause

## Escalation Path

1. On-call SRE (P2 - 15 min response)
2. Service owner team (P2 - 30 min response)
3. Database team if query-related (P2 - 30 min response)

## Related Dashboards

- Service Latency Analysis Dashboard
- Database Performance Dashboard
- Service Overview Dashboard
