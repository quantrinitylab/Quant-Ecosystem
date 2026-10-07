# Production Cutover Runbook

Complete procedure for deploying Quant Platform to the production environment with multi-region failover.

## Prerequisites

- [ ] Staging 72h green verification completed
- [ ] Dogfooding checklist fully signed off
- [ ] AWS credentials configured with production account access
- [ ] `kubectl` configured for production EKS clusters (us-east-1 + eu-west-1)
- [ ] `terraform` >= 1.5.0 installed
- [ ] `helm` >= 3.0 installed
- [ ] ArgoCD CLI installed and authenticated
- [ ] DNS access for quant.app
- [ ] Argo Rollouts kubectl plugin installed
- [ ] All team members notified of cutover window

## Phase 1: Multi-Region Infrastructure (Terraform)

### 1.1 Initialize Terraform

```bash
cd infra/terraform/environments/production
terraform init -backend-config="bucket=quant-terraform-state-production"
```

### 1.2 Plan Infrastructure

```bash
terraform plan -var-file=production.tfvars -out=production.plan
```

Review the plan. Expected resources:

- Primary VPC (us-east-1) with 3 AZs
- Secondary VPC (eu-west-1) with 3 AZs
- Primary EKS cluster (m5.xlarge nodes, ON_DEMAND)
- RDS PostgreSQL (db.r6g.xlarge, Multi-AZ)
- Cross-region RDS read replica (eu-west-1)
- ElastiCache Redis (3 shards, 2 replicas each)
- S3 with cross-region replication
- CloudFront (PriceClass_All, WAF enabled)
- Route53 health checks with failover routing
- Monitoring, backup verification, synthetic monitoring

### 1.3 Apply Infrastructure (Primary Region)

```bash
terraform apply production.plan
```

### 1.4 Verify Multi-Region Resources

```bash
# Primary EKS
aws eks describe-cluster --name quant-production-eks --region us-east-1 --query 'cluster.status'

# Cross-region RDS replica
aws rds describe-db-instances --db-instance-identifier quant-production-replica-eu --region eu-west-1 --query 'DBInstances[0].DBInstanceStatus'

# Route53 health checks
aws route53 list-health-checks --query 'HealthChecks[?HealthCheckConfig.FullyQualifiedDomainName==`quant.app`]'

# S3 replication
aws s3api get-bucket-replication --bucket quant-production-quantube-videos
```

## Phase 2: TLS and DNS

### 2.1 ACM Certificate for quant.app

```bash
aws acm request-certificate \
  --domain-name "quant.app" \
  --subject-alternative-names "*.quant.app" \
  --validation-method DNS \
  --region us-east-1
```

### 2.2 Validate and Wait

```bash
aws acm wait certificate-validated --certificate-arn <cert-arn> --region us-east-1
```

### 2.3 Configure DNS Records

| Record       | Type  | Value           | Routing              |
| ------------ | ----- | --------------- | -------------------- |
| quant.app    | A     | ALB (us-east-1) | Failover - Primary   |
| quant.app    | A     | ALB (eu-west-1) | Failover - Secondary |
| \*.quant.app | CNAME | quant.app       | Simple               |

## Phase 3: Canary Deployment

### 3.1 Deploy via ArgoCD

```bash
kubectl apply -f infra/argocd/project.yaml
kubectl apply -f infra/argocd/applicationset.yaml
```

### 3.2 Trigger Initial Sync

```bash
argocd app sync quant-platform-production
```

### 3.3 Monitor Canary Rollout

The canary strategy deploys with progressive traffic shifting:

| Step | Weight | Pause      | Analysis |
| ---- | ------ | ---------- | -------- |
| 1    | 1%     | 5 minutes  | Yes      |
| 2    | 10%    | 10 minutes | Yes      |
| 3    | 50%    | 15 minutes | Yes      |
| 4    | 100%   | -          | Yes      |

Monitor each step:

```bash
# Watch rollout status
kubectl argo rollouts get rollout quant-platform-identity-canary -n quant-production -w

# Check analysis runs
kubectl get analysisruns -n quant-production

# View canary metrics
kubectl argo rollouts status quant-platform-chat-api-canary -n quant-production
```

### 3.4 Manual Promotion (if needed)

If auto-promotion is paused or you want to manually advance:

```bash
./infra/scripts/canary-promote.sh --namespace quant-production --action promote --service identity
```

### 3.5 Abort on Failure

If metrics exceed thresholds (error rate > 1% or p99 > 2s), automatic rollback triggers. For manual abort:

```bash
./infra/scripts/canary-promote.sh --namespace quant-production --action abort --service identity
```

## Phase 4: Backup Verification

### 4.1 Verify Backup Plan Active

```bash
aws backup describe-backup-vault --backup-vault-name quant-production-backup-vault
aws backup list-backup-plans --query 'BackupPlansList[?BackupPlanName==`quant-production-backup-plan`]'
```

### 4.2 Run Manual Backup Verification

```bash
./infra/scripts/backup-verify.sh --vault quant-production-backup-vault --region us-east-1
```

### 4.3 Confirm Automated Schedules

| Schedule            | Frequency                 | Retention                 |
| ------------------- | ------------------------- | ------------------------- |
| Daily RDS snapshots | Every day at 03:00 UTC    | 7 days                    |
| Weekly full backup  | Every Sunday at 02:00 UTC | 30 days                   |
| Monthly long-term   | 1st of month at 01:00 UTC | 365 days (cold after 30d) |
| Restore test        | Every Monday at 04:00 UTC | N/A                       |

## Phase 5: Post-Cutover Validation

### 5.1 Synthetic Monitoring

```bash
# Verify all canaries are running
aws synthetics describe-canaries --name-prefix "quant-production"

# Check success rates
aws cloudwatch get-metric-data \
  --metric-data-queries '[{"Id":"m1","MetricStat":{"Metric":{"Namespace":"CloudWatchSynthetics","MetricName":"SuccessPercent","Dimensions":[{"Name":"CanaryName","Value":"quant-production-identity"}]},"Period":300,"Stat":"Average"}}]' \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S)
```

### 5.2 Health Checks

`health-check.sh` polls `BASE_URL:PORT` per service, so it validates a
docker-compose host or a `kubectl port-forward` — **not** the ingress, where
every app answers on 443 under its own hostname and 3010/3011/3015/3020/3100 are
closed. Passing `--base-url https://<domain>` reports a false platform-wide
outage; that is what this step used to do.

```bash
# A: local / port-forwarded topology (BASE_URL defaults to http://localhost)
./infra/scripts/health-check.sh
```

```bash
# B: the public edge, one hostname at a time. `/api/*` is rewritten onto the
# Fastify backend, so `/api/readyz` is the check that proves the pod can reach
# Postgres — it returns 503, not 200, when it cannot.
DOMAIN=quantmail.in
curl -fsS "https://$DOMAIN/api/readyz"                   # {"status":"ok","checks":{"database":"ok",...}}
curl -fsS "https://$DOMAIN/api/healthz"                  # backend process liveness
curl -fsS -o /dev/null -w '%{http_code}\n' "https://$DOMAIN/"   # frontend container: 200
```

### 5.3 Route53 Failover Test

```bash
# Verify health check status
aws route53 get-health-check-status --health-check-id <primary-check-id>
aws route53 get-health-check-status --health-check-id <secondary-check-id>
```

## Rollback Procedures

### Application Rollback (Argo Rollouts)

```bash
# Abort all canaries (immediate rollback)
./infra/scripts/canary-promote.sh --namespace quant-production --action abort

# Or rollback specific service
kubectl argo rollouts undo quant-platform-identity-canary -n quant-production
```

### ArgoCD Rollback

```bash
argocd app rollback quant-platform-production
```

### Infrastructure Rollback

```bash
cd infra/terraform/environments/production
git checkout HEAD~1 -- .
terraform plan -var-file=production.tfvars -out=rollback.plan
terraform apply rollback.plan
```

### DNS Failover (Manual)

If primary region is completely down and automatic failover is not triggering:

```bash
# Force traffic to secondary
aws route53 change-resource-record-sets --hosted-zone-id <zone-id> \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"quant.app","Type":"A","AliasTarget":{"HostedZoneId":"<secondary-alb-zone>","DNSName":"<secondary-alb-dns>","EvaluateTargetHealth":false}}}]}'
```

## Success Criteria

- [ ] All services responding with HTTP 200
- [ ] Synthetic canaries green for > 1 hour
- [ ] Error rate < 0.1%
- [ ] P99 latency < 500ms
- [ ] Route53 health checks passing
- [ ] Cross-region replica in sync (replication lag < 1s)
- [ ] Backup plan active and first snapshot completed
- [ ] CDN serving assets correctly
- [ ] TLS certificates valid and auto-renewing

## Contacts

| Role                 | Contact              |
| -------------------- | -------------------- |
| Infrastructure Lead  | @infra-team          |
| Platform Engineering | @platform-team       |
| Database Admin       | @dba-team            |
| Security             | @security-team       |
| On-Call              | PagerDuty escalation |
| Incident Commander   | Rotating schedule    |
