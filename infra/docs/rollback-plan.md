# Quant Platform - Rollback Plan

## Overview

This document describes the rollback procedures for Helm-based service deployments and database migrations in the Quant Platform. All rollbacks should be initiated within 5 minutes of detecting a production incident.

## Prerequisites

- `kubectl` access to the target cluster
- `helm` CLI configured with appropriate credentials
- Access to ArgoCD dashboard (for GitOps-based rollbacks)
- Database admin credentials for migration rollbacks

## Helm Deployment Rollback

### Quick Rollback (Single Service)

```bash
# List recent releases for a service
helm history <service-name> -n quant-production

# Roll back to the previous release
helm rollback <service-name> -n quant-production

# Roll back to a specific revision
helm rollback <service-name> <revision-number> -n quant-production
```

### Example: Rolling Back identity-service

```bash
# Check current and previous versions
helm history identity-service -n quant-production

# Rollback to previous revision
helm rollback identity-service -n quant-production

# Verify rollback
kubectl rollout status deployment/identity-service -n quant-production
kubectl get pods -l app=identity-service -n quant-production
```

### Full Platform Rollback

If multiple services are affected, use the platform chart:

```bash
# Roll back the entire platform release
helm rollback quant-platform -n quant-production

# Monitor rollout progress
kubectl get pods -n quant-production -w
```

### ArgoCD GitOps Rollback

For GitOps-managed deployments:

1. Open ArgoCD dashboard at `https://argocd.quant.internal`
2. Navigate to the affected application
3. Click "History and Rollback"
4. Select the last known-good revision
5. Click "Rollback"

Alternatively via CLI:

```bash
# List application history
argocd app history quant-platform

# Rollback to a specific revision
argocd app rollback quant-platform <revision-id>
```

## Database Migration Rollback

### General Approach

All migrations are designed to be reversible. Each migration file includes both `up()` and `down()` methods.

### Rolling Back Migrations

```bash
# Check current migration status
pnpm db:migrate:status

# Roll back the last migration
pnpm db:migrate:down

# Roll back multiple migrations (specify count)
pnpm db:migrate:down --steps=3

# Roll back to a specific migration version
pnpm db:migrate:down --to=20240115_001
```

### Important Considerations for Database Rollbacks

1. **Data Loss Risk**: Destructive migrations (column drops, table drops) cannot be fully reversed. Always verify data impact before rolling back.

2. **Application Compatibility**: Ensure the application version is compatible with the database schema after rollback. Usually roll back the application first, then the migration.

3. **Multi-Service Migrations**: If a migration affects tables used by multiple services, coordinate rollback order:
   - Stop dependent services first
   - Roll back the migration
   - Redeploy services in dependency order

### Emergency Database Restore

If migration rollback is not possible (e.g., data corruption):

```bash
# Identify the most recent backup
aws s3 ls s3://quant-backups/postgres/production/ --recursive | sort | tail -5

# Restore from point-in-time recovery (preferred)
# This uses the continuous WAL archiving
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier quant-production \
  --target-db-instance-identifier quant-production-recovery \
  --restore-time "2024-01-15T10:30:00Z"
```

## Canary Rollback

If a canary deployment shows degraded metrics:

```bash
# Scale down canary pods
kubectl scale deployment/<service>-canary --replicas=0 -n quant-production

# Or use Helm to remove canary
helm upgrade <service> ./helm/quant-platform \
  --set services.<service>.canary.enabled=false \
  -n quant-production
```

## Rollback Decision Matrix

| Symptom                       | Action                                       | Time Limit |
| ----------------------------- | -------------------------------------------- | ---------- |
| 5xx error rate >5%            | Immediate Helm rollback                      | 2 minutes  |
| P99 latency >5s               | Investigate, then rollback if no improvement | 5 minutes  |
| Canary error rate 1.5x stable | Scale down canary                            | 3 minutes  |
| Data corruption detected      | Stop writes, restore from backup             | 10 minutes |
| Single pod crash-looping      | Restart pod; if persistent, rollback         | 5 minutes  |
| Memory/CPU saturation         | Scale up, then investigate; rollback if OOM  | 5 minutes  |

## Post-Rollback Checklist

1. [ ] Verify service health via `/healthz` and `/readyz` endpoints
2. [ ] Check error rate has returned to baseline in Grafana
3. [ ] Verify no data inconsistencies in affected tables
4. [ ] Update incident channel with rollback status
5. [ ] Create a postmortem ticket
6. [ ] Notify stakeholders of the rollback

## Communication Template

```
[INCIDENT] Rollback executed for <service>
- Time: <UTC timestamp>
- Reason: <brief description>
- Rolled back from: v<new> to v<previous>
- Impact window: <start> to <end>
- Status: Monitoring
- Next steps: Postmortem scheduled
```
