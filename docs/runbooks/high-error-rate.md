# Runbook: High Error Rate

## Symptoms

- Alert: `ServiceHighErrorRate` or `*AvailabilitySLO` firing
- Error rate above 1% (critical) or 0.5% (warning)
- Increased 5xx responses visible in RED metrics dashboard
- Users reporting failures or degraded functionality

## Diagnosis

1. **Check the error rate dashboard:**
   - Navigate to Grafana > RED Metrics > Error Rate by Service
   - Identify which service(s) are affected

2. **Inspect recent deployments:**

   ```bash
   kubectl rollout history deployment/<service> -n quant-platform
   ```

3. **Check pod health:**

   ```bash
   kubectl get pods -n quant-platform -l app=<service>
   kubectl describe pod <pod-name> -n quant-platform
   ```

4. **Review application logs:**

   ```bash
   kubectl logs -n quant-platform -l app=<service> --tail=100 --since=10m
   ```

5. **Check downstream dependencies:**
   - Database connectivity
   - External API health
   - Message queue status

## Remediation

1. **If caused by a recent deployment:**

   ```bash
   kubectl rollout undo deployment/<service> -n quant-platform
   ```

2. **If caused by resource exhaustion:**
   - Scale horizontally: `kubectl scale deployment/<service> --replicas=<N>`
   - Check HPA status: `kubectl get hpa -n quant-platform`

3. **If caused by downstream failure:**
   - Verify circuit breakers are engaged
   - Check fallback mechanisms are active
   - Consider enabling degraded mode

4. **If cause is unknown:**
   - Enable debug logging temporarily
   - Capture heap dump if memory-related
   - Check for infrastructure issues (node failures, network partitions)

## Escalation

| Level | Contact             | Timeframe  |
| ----- | ------------------- | ---------- |
| L1    | On-call SRE         | Immediate  |
| L2    | Service team lead   | 15 minutes |
| L3    | Engineering manager | 30 minutes |
| L4    | VP Engineering      | 1 hour     |

## Related Alerts

- `SLOBurnRateCritical`
- `PodCrashLooping`
- `HighLatency`
