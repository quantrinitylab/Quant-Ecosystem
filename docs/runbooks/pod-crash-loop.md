# Runbook: Pod CrashLoopBackOff

## Symptoms

- Alert: `PodCrashLooping` firing
- Pod status shows `CrashLoopBackOff`
- Container restart count increasing rapidly
- Service availability degraded

## Diagnosis

1. **Check pod status:**

   ```bash
   kubectl get pods -n quant-platform -l app=<service>
   kubectl describe pod <pod-name> -n quant-platform
   ```

2. **Review container logs (including previous crash):**

   ```bash
   kubectl logs -n quant-platform <pod-name> --previous
   kubectl logs -n quant-platform <pod-name> --tail=50
   ```

3. **Check events:**

   ```bash
   kubectl get events -n quant-platform --sort-by='.lastTimestamp' | grep <service>
   ```

4. **Common crash causes:**
   - OOMKilled: Check memory limits vs actual usage
   - Config errors: Verify ConfigMaps and Secrets
   - Dependency failure: Check health of required services
   - Startup probe failure: Verify application startup time
   - Permission errors: Check RBAC and security contexts

5. **Check recent changes:**
   ```bash
   kubectl rollout history deployment/<service> -n quant-platform
   helm history <release-name> -n quant-platform
   ```

## Remediation

1. **If OOMKilled:**
   - Increase memory limits: edit deployment resource limits
   - Investigate memory leaks in application

2. **If config error:**
   - Verify ConfigMap/Secret values are correct
   - Check for missing environment variables
   - Validate configuration file syntax

3. **If dependency failure:**
   - Ensure dependent services are healthy
   - Check database connectivity
   - Verify external service endpoints

4. **If startup timeout:**
   - Increase `initialDelaySeconds` on startup/readiness probes
   - Optimize application startup time
   - Check for slow initialization (large caches, migrations)

5. **Roll back if caused by recent deployment:**
   ```bash
   kubectl rollout undo deployment/<service> -n quant-platform
   ```

## Escalation

| Level | Contact             | Timeframe  |
| ----- | ------------------- | ---------- |
| L1    | On-call SRE         | Immediate  |
| L2    | Service owner       | 10 minutes |
| L3    | Platform team       | 20 minutes |
| L4    | Engineering manager | 30 minutes |

## Related Alerts

- `HighErrorRate`
- `ServiceUnavailable`
- `NodeNotReady`
