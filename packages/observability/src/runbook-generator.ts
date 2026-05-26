// ============================================================================
// Runbook Generator - Auto-generate Runbook Templates
// ============================================================================

import { RunbookTemplate } from './types';

type AlertType =
  | 'high-error-rate'
  | 'high-latency'
  | 'budget-exhaustion'
  | 'pod-crash-loop'
  | 'memory-pressure';

const ALERT_TYPES: AlertType[] = [
  'high-error-rate',
  'high-latency',
  'budget-exhaustion',
  'pod-crash-loop',
  'memory-pressure',
];

export class RunbookGenerator {
  /**
   * Generate a runbook markdown template for a specific service and alert type.
   */
  generateRunbook(serviceName: string, alertType: string): string {
    switch (alertType as AlertType) {
      case 'high-error-rate':
        return this.generateHighErrorRateRunbook(serviceName);
      case 'high-latency':
        return this.generateHighLatencyRunbook(serviceName);
      case 'budget-exhaustion':
        return this.generateBudgetExhaustionRunbook(serviceName);
      case 'pod-crash-loop':
        return this.generatePodCrashLoopRunbook(serviceName);
      case 'memory-pressure':
        return this.generateMemoryPressureRunbook(serviceName);
      default:
        return this.generateGenericRunbook(serviceName, alertType);
    }
  }

  /**
   * Generate all runbooks for a list of services.
   * Returns Map with key = serviceName-alertType.
   */
  generateAllRunbooks(services: string[]): Map<string, RunbookTemplate> {
    const runbooks = new Map<string, RunbookTemplate>();
    for (const service of services) {
      for (const alertType of ALERT_TYPES) {
        const key = `${service}-${alertType}`;
        runbooks.set(key, {
          serviceName: service,
          alertType,
          content: this.generateRunbook(service, alertType),
        });
      }
    }
    return runbooks;
  }

  private generateHighErrorRateRunbook(serviceName: string): string {
    return `# Runbook: High Error Rate - ${serviceName}

## Description
The error rate for ${serviceName} has exceeded the configured threshold.

## Severity
Critical

## Impact
Users may experience failed requests, degraded functionality, or complete service unavailability for ${serviceName}.

## Detection
- Alert triggered when error rate exceeds 1% over a 5-minute window
- Monitor: ${serviceName}_error_rate
- Dashboard: ${serviceName} Service Overview

## Investigation Steps
1. Check the error logs for ${serviceName}: \`kubectl logs -l app=${serviceName} --tail=100\`
2. Verify downstream dependencies are healthy
3. Check recent deployments: \`kubectl rollout history deployment/${serviceName}\`
4. Review error distribution by endpoint and error code
5. Check if the issue correlates with increased traffic

## Remediation Steps
1. If caused by a recent deployment, rollback: \`kubectl rollout undo deployment/${serviceName}\`
2. If downstream dependency failure, check dependency health and consider circuit breaker activation
3. If resource exhaustion, scale up: \`kubectl scale deployment/${serviceName} --replicas=<N>\`
4. If data corruption, isolate affected data and restore from backup

## Escalation Path
1. On-call SRE (P1 - 5 min response)
2. Service owner team (P1 - 15 min response)
3. Platform team lead (P1 - 30 min response)

## Related Dashboards
- [${serviceName} Service Overview](grafana/d/${serviceName}-overview)
- [${serviceName} Error Analysis](grafana/d/${serviceName}-errors)
- [Infrastructure Overview](grafana/d/infra-overview)
`;
  }

  private generateHighLatencyRunbook(serviceName: string): string {
    return `# Runbook: High Latency - ${serviceName}

## Description
Response latency for ${serviceName} has exceeded acceptable thresholds (p95 > 200ms or p99 > 500ms).

## Severity
Warning

## Impact
Users may experience slow page loads, timeouts, or degraded experience when interacting with ${serviceName}.

## Detection
- Alert triggered when p95 latency exceeds 200ms or p99 exceeds 500ms
- Monitor: ${serviceName}_request_duration_seconds
- Dashboard: ${serviceName} Latency Panel

## Investigation Steps
1. Identify slow endpoints: check latency breakdown by route
2. Check database query performance: \`SELECT * FROM pg_stat_activity WHERE state = 'active'\`
3. Review CPU and memory utilization for ${serviceName} pods
4. Check for connection pool exhaustion
5. Verify network latency between services

## Remediation Steps
1. Scale horizontally if CPU-bound: \`kubectl scale deployment/${serviceName} --replicas=<N>\`
2. Optimize slow database queries (add indexes, rewrite queries)
3. Enable or tune caching layers
4. Increase connection pool size if pool exhaustion detected
5. Consider rate limiting if traffic spike is the cause

## Escalation Path
1. On-call SRE (P2 - 15 min response)
2. Service owner team (P2 - 30 min response)
3. Database team if query-related (P2 - 30 min response)

## Related Dashboards
- [${serviceName} Latency Analysis](grafana/d/${serviceName}-latency)
- [Database Performance](grafana/d/db-performance)
- [${serviceName} Service Overview](grafana/d/${serviceName}-overview)
`;
  }

  private generateBudgetExhaustionRunbook(serviceName: string): string {
    return `# Runbook: Error Budget Exhaustion - ${serviceName}

## Description
The error budget for ${serviceName} is exhausted or burning at an unsustainable rate.

## Severity
Critical

## Impact
The service has consumed its allowed failure budget. Further deployments should be halted until reliability improves.

## Detection
- Alert triggered when error budget remaining drops below 0% or burn rate exceeds 14.4x
- Monitor: ${serviceName}_error_budget_remaining
- Dashboard: ${serviceName} SLO Burn Rate

## Investigation Steps
1. Review the SLO status dashboard for burn rate trends
2. Identify the time period when budget consumption accelerated
3. Correlate with deployment events or infrastructure changes
4. Check if specific endpoints or features are disproportionately failing
5. Review incident history for recurring issues

## Remediation Steps
1. Halt all non-critical deployments to ${serviceName}
2. Prioritize reliability fixes over feature work
3. Implement targeted fixes for top error contributors
4. Consider enabling feature flags to disable unstable features
5. Schedule post-mortem to identify systemic improvements

## Escalation Path
1. On-call SRE (P1 - 5 min response)
2. Engineering manager (P1 - 15 min response)
3. VP Engineering for deployment freeze approval (P1 - 30 min response)

## Related Dashboards
- [${serviceName} SLO Overview](grafana/d/${serviceName}-slo)
- [${serviceName} Error Budget](grafana/d/${serviceName}-budget)
- [Deployment History](grafana/d/deployments)
`;
  }

  private generatePodCrashLoopRunbook(serviceName: string): string {
    return `# Runbook: Pod Crash Loop - ${serviceName}

## Description
Pods for ${serviceName} are repeatedly crashing and restarting (CrashLoopBackOff).

## Severity
Critical

## Impact
Service capacity is reduced. If all pods are crash-looping, the service is completely unavailable.

## Detection
- Alert triggered when pod restart count exceeds threshold within time window
- Monitor: kube_pod_container_status_restarts_total
- Dashboard: Kubernetes Pod Health

## Investigation Steps
1. Check pod status: \`kubectl get pods -l app=${serviceName}\`
2. Check pod logs: \`kubectl logs -l app=${serviceName} --previous\`
3. Check events: \`kubectl describe pod <pod-name>\`
4. Verify resource limits (OOMKilled?)
5. Check if liveness/readiness probes are misconfigured

## Remediation Steps
1. If OOMKilled, increase memory limits in deployment spec
2. If application error, rollback: \`kubectl rollout undo deployment/${serviceName}\`
3. If configuration error, fix configmap/secret and restart
4. If dependency unavailable, check upstream services
5. If probe failure, adjust probe thresholds or fix health endpoint

## Escalation Path
1. On-call SRE (P1 - 5 min response)
2. Service owner team (P1 - 15 min response)
3. Platform team for infrastructure issues (P1 - 15 min response)

## Related Dashboards
- [Kubernetes Pod Health](grafana/d/k8s-pods)
- [${serviceName} Service Overview](grafana/d/${serviceName}-overview)
- [Node Resource Utilization](grafana/d/node-resources)
`;
  }

  private generateMemoryPressureRunbook(serviceName: string): string {
    return `# Runbook: Memory Pressure - ${serviceName}

## Description
Memory utilization for ${serviceName} is approaching or exceeding safe thresholds.

## Severity
Warning

## Impact
Potential OOM kills, degraded performance due to GC pressure, or service instability.

## Detection
- Alert triggered when memory utilization exceeds 85% of limit
- Monitor: container_memory_working_set_bytes
- Dashboard: ${serviceName} Resource Utilization

## Investigation Steps
1. Check current memory usage: \`kubectl top pods -l app=${serviceName}\`
2. Review memory trends over last 24h in dashboard
3. Check for memory leaks (monotonically increasing usage)
4. Review recent code changes that may affect memory usage
5. Check heap dumps if available

## Remediation Steps
1. If memory leak, identify and fix the leak, then deploy fix
2. If legitimate growth, increase memory limits
3. If GC pressure, tune GC parameters (heap size, GC algorithm)
4. Scale horizontally to distribute memory load
5. If acute, restart pods to reclaim memory: \`kubectl rollout restart deployment/${serviceName}\`

## Escalation Path
1. On-call SRE (P2 - 15 min response)
2. Service owner team (P2 - 30 min response)
3. Platform team for capacity planning (P3 - next business day)

## Related Dashboards
- [${serviceName} Resource Utilization](grafana/d/${serviceName}-resources)
- [Node Memory Overview](grafana/d/node-memory)
- [GC Analysis](grafana/d/${serviceName}-gc)
`;
  }

  private generateGenericRunbook(serviceName: string, alertType: string): string {
    return `# Runbook: ${alertType} - ${serviceName}

## Description
Alert of type "${alertType}" triggered for ${serviceName}.

## Severity
Warning

## Impact
Service may be experiencing degraded performance or availability.

## Detection
- Monitor the relevant metrics dashboard for ${serviceName}

## Investigation Steps
1. Check service logs: \`kubectl logs -l app=${serviceName} --tail=100\`
2. Review metrics dashboard for anomalies
3. Check recent deployments and configuration changes
4. Verify downstream dependencies

## Remediation Steps
1. Follow service-specific remediation procedures
2. Rollback recent changes if correlated
3. Scale resources if needed
4. Contact service owner team

## Escalation Path
1. On-call SRE
2. Service owner team
3. Engineering management

## Related Dashboards
- [${serviceName} Service Overview](grafana/d/${serviceName}-overview)
`;
  }
}
