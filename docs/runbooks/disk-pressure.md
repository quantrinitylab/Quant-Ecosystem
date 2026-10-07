# Runbook: Disk Pressure

## Symptoms

- Alert: `DiskSaturation` or `NodeDiskPressure` firing
- Disk usage above 85% (warning) or 90% (critical)
- Pods being evicted due to disk pressure
- Application errors related to write failures
- Log ingestion failures

## Diagnosis

1. **Check disk usage on affected nodes/pods:**

   ```bash
   kubectl describe node <node-name> | grep -A5 "Conditions"
   kubectl exec -n quant-platform <pod> -- df -h
   ```

2. **Identify largest consumers:**

   ```bash
   kubectl exec -n quant-platform <pod> -- du -sh /tmp/* /var/log/* /data/*
   ```

3. **Check PVC usage:**

   ```bash
   kubectl get pvc -n quant-platform
   kubectl describe pvc <pvc-name> -n quant-platform
   ```

4. **Common causes:**
   - Log files growing unbounded
   - Temporary files not being cleaned up
   - Database WAL/binlog accumulation
   - Container image layers consuming space
   - Failed backup artifacts not removed

5. **Check node-level disk:**
   ```bash
   kubectl top node
   kubectl describe node <node> | grep "disk pressure"
   ```

## Remediation

1. **Immediate: Free up space:**

   ```bash
   # Clean up old logs
   kubectl exec -n quant-platform <pod> -- find /var/log -name "*.log" -mtime +7 -delete

   # Clean up tmp files
   kubectl exec -n quant-platform <pod> -- rm -rf /tmp/old-*

   # Truncate large log files
   kubectl exec -n quant-platform <pod> -- truncate -s 0 /var/log/app.log
   ```

2. **Clean container images on nodes:**

   ```bash
   # Remove unused images (on the node)
   docker system prune -af
   crictl rmi --prune
   ```

3. **Expand storage:**
   - Resize PVC (if storage class supports it)
   - Add additional volumes
   - Migrate to larger instance type

4. **Prevent recurrence:**
   - Implement log rotation policies
   - Set up automatic cleanup cronjobs
   - Configure proper retention policies for databases
   - Set resource quotas for disk usage

5. **If node is in disk pressure:**
   - Cordon the node: `kubectl cordon <node>`
   - Clean up disk space
   - Uncordon once resolved: `kubectl uncordon <node>`

## Escalation

| Level | Contact             | Timeframe            |
| ----- | ------------------- | -------------------- |
| L1    | On-call SRE         | Immediate (critical) |
| L2    | Platform team       | 15 minutes           |
| L3    | Infrastructure team | 30 minutes           |

## Related Alerts

- `PodEvicted`
- `WriteErrors`
- `DatabaseDiskFull`
