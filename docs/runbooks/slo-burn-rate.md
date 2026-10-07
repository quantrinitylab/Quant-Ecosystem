# Runbook: SLO Burn Rate Alert

## Symptoms

- Alert: `SLOBurnRateCritical`, `SLOBurnRateWarning`, or `SLOBurnRateInfo` firing
- Error budget being consumed faster than sustainable
- Burn rate thresholds:
  - Critical: 14.4x (budget exhausted in ~2 days)
  - Warning: 6x (budget exhausted in ~5 days)
  - Info: 3x (budget exhausted in ~10 days)

## Diagnosis

1. **Check SLO Overview dashboard:**
   - Navigate to Grafana > SLO Overview
   - Identify which service(s) are burning budget
   - Check remaining error budget percentage

2. **Determine burn rate window:**
   - Critical alerts use 1h/5m dual windows
   - Warning alerts use 6h/30m dual windows
   - Info alerts use 24h/1h dual windows

3. **Correlate with recent events:**
   - Check deployment history
   - Look for infrastructure changes
   - Check for traffic pattern changes (DDoS, viral content)

4. **Calculate time to budget exhaustion:**

   ```
   Time remaining = (remaining budget / current burn rate) * 30 days
   ```

5. **Check if burn rate is improving:**
   - Compare short window vs long window rates
   - If short window rate is lower, the issue may be resolving

## Remediation

1. **Critical (14.4x burn rate):**
   - Immediate action required
   - Roll back recent deployments
   - Scale up affected services
   - Engage incident response process

2. **Warning (6x burn rate):**
   - Investigate root cause within 30 minutes
   - Prepare rollback plan
   - Consider traffic shaping or load shedding

3. **Info (3x burn rate):**
   - Schedule investigation for next business day
   - Monitor for trend improvement
   - Review recent changes that may be contributing

4. **General mitigation:**
   - Enable feature flags to disable problematic features
   - Increase circuit breaker sensitivity
   - Route traffic away from degraded instances

## Escalation

| Level         | Contact             | Timeframe             |
| ------------- | ------------------- | --------------------- |
| L1 (Info)     | On-call SRE         | Next business day     |
| L1 (Warning)  | On-call SRE         | 30 minutes            |
| L1 (Critical) | On-call SRE         | Immediate             |
| L2            | Service team lead   | 15 minutes (critical) |
| L3            | Engineering manager | 30 minutes (critical) |

## Related Alerts

- `HighErrorRate`
- `HighLatency`
- `ServiceAvailabilitySLO`
