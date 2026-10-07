# High Error Rate Runbook

## Description

The error rate for the service has exceeded the configured threshold, indicating a significant number of requests are failing.

## Severity

Critical

## Impact

Users may experience failed requests, degraded functionality, or complete service unavailability.

## Detection

- Alert triggered when error rate exceeds 1% over a 5-minute window
- Monitor the service error rate metric
- Check the service overview dashboard for error spikes

## Investigation Steps

1. Check the error logs for the affected service: `kubectl logs -l app=<service> --tail=100`
2. Verify downstream dependencies are healthy
3. Check recent deployments: `kubectl rollout history deployment/<service>`
4. Review error distribution by endpoint and error code
5. Check if the issue correlates with increased traffic

## Remediation Steps

1. If caused by a recent deployment, rollback: `kubectl rollout undo deployment/<service>`
2. If downstream dependency failure, check dependency health and consider circuit breaker activation
3. If resource exhaustion, scale up: `kubectl scale deployment/<service> --replicas=<N>`
4. If data corruption, isolate affected data and restore from backup

## Escalation Path

1. On-call SRE (P1 - 5 min response)
2. Service owner team (P1 - 15 min response)
3. Platform team lead (P1 - 30 min response)

## Related Dashboards

- Service Overview Dashboard
- Error Analysis Dashboard
- Infrastructure Overview Dashboard
