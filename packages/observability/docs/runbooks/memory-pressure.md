# Memory Pressure Runbook

## Description

Memory utilization for the service is approaching or exceeding safe thresholds.

## Severity

Warning

## Impact

Potential OOM kills, degraded performance due to GC pressure, or service instability.

## Detection

- Alert triggered when memory utilization exceeds 85% of limit
- Monitor container_memory_working_set_bytes metric
- Check the Resource Utilization dashboard

## Investigation Steps

1. Check current memory usage: `kubectl top pods -l app=<service>`
2. Review memory trends over last 24h in dashboard
3. Check for memory leaks (monotonically increasing usage)
4. Review recent code changes that may affect memory usage
5. Check heap dumps if available

## Remediation Steps

1. If memory leak, identify and fix the leak, then deploy fix
2. If legitimate growth, increase memory limits
3. If GC pressure, tune GC parameters (heap size, GC algorithm)
4. Scale horizontally to distribute memory load
5. If acute, restart pods to reclaim memory: `kubectl rollout restart deployment/<service>`

## Escalation Path

1. On-call SRE (P2 - 15 min response)
2. Service owner team (P2 - 30 min response)
3. Platform team for capacity planning (P3 - next business day)

## Related Dashboards

- Service Resource Utilization Dashboard
- Node Memory Overview Dashboard
- GC Analysis Dashboard
