# Runbook: High Latency

## Symptoms

- Alert: `*LatencySLO` or `*_high_latency_p95/p99` firing
- p95 latency above 500ms or p99 above 1s
- Users reporting slow page loads or timeouts
- Increased timeout errors in logs

## Diagnosis

1. **Check latency dashboard:**
   - Navigate to Grafana > RED Metrics > Request Duration
   - Identify percentile distribution and affected endpoints

2. **Identify slow endpoints:**

   ```bash
   kubectl exec -n quant-platform <pod> -- curl localhost:9090/metrics | grep http_request_duration
   ```

3. **Check resource utilization:**
   - CPU throttling: `kubectl top pods -n quant-platform -l app=<service>`
   - Memory pressure: Check OOM events in pod events
   - Network: Check for packet loss or retransmits

4. **Inspect database queries:**
   - Check slow query logs
   - Verify connection pool utilization
   - Look for lock contention

5. **Check external dependencies:**
   - Third-party API response times
   - DNS resolution latency
   - TLS handshake overhead

## Remediation

1. **If caused by CPU throttling:**
   - Increase CPU limits in deployment spec
   - Scale horizontally to distribute load

2. **If caused by database:**
   - Kill long-running queries
   - Add missing indexes
   - Scale read replicas

3. **If caused by garbage collection:**
   - Increase heap size
   - Review memory allocation patterns
   - Consider GC tuning parameters

4. **If caused by network:**
   - Check service mesh sidecar (Envoy) metrics
   - Verify DNS caching is working
   - Check for network policy issues

5. **If caused by downstream service:**
   - Enable circuit breaker with timeout fallback
   - Consider caching responses
   - Implement request hedging

## Escalation

| Level | Contact                       | Timeframe  |
| ----- | ----------------------------- | ---------- |
| L1    | On-call SRE                   | Immediate  |
| L2    | Service team lead             | 15 minutes |
| L3    | Database team (if DB-related) | 20 minutes |
| L4    | Platform team                 | 30 minutes |

## Related Alerts

- `HighCPUUtilization`
- `MemorySaturation`
- `SLOBurnRateWarning`
