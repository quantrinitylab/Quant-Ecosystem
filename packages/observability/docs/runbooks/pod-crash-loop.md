# Pod Crash Loop Runbook

## Description

Pods for the service are repeatedly crashing and restarting (CrashLoopBackOff).

## Severity

Critical

## Impact

Service capacity is reduced. If all pods are crash-looping, the service is completely unavailable.

## Detection

- Alert triggered when pod restart count exceeds threshold within time window
- Monitor kube_pod_container_status_restarts_total metric
- Check the Kubernetes Pod Health dashboard

## Investigation Steps

1. Check pod status: `kubectl get pods -l app=<service>`
2. Check pod logs: `kubectl logs -l app=<service> --previous`
3. Check events: `kubectl describe pod <pod-name>`
4. Verify resource limits (OOMKilled?)
5. Check if liveness/readiness probes are misconfigured

## Remediation Steps

1. If OOMKilled, increase memory limits in deployment spec
2. If application error, rollback: `kubectl rollout undo deployment/<service>`
3. If configuration error, fix configmap/secret and restart
4. If dependency unavailable, check upstream services
5. If probe failure, adjust probe thresholds or fix health endpoint

## Escalation Path

1. On-call SRE (P1 - 5 min response)
2. Service owner team (P1 - 15 min response)
3. Platform team for infrastructure issues (P1 - 15 min response)

## Related Dashboards

- Kubernetes Pod Health Dashboard
- Service Overview Dashboard
- Node Resource Utilization Dashboard
