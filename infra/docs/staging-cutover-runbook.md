# Staging Cutover Runbook

Complete procedure for deploying Quant Platform to the staging environment.

## Prerequisites

- [ ] AWS credentials configured with staging account access
- [ ] `kubectl` configured for staging EKS cluster
- [ ] `terraform` >= 1.5.0 installed
- [ ] `helm` >= 3.0 installed
- [ ] ArgoCD CLI installed and authenticated
- [ ] DNS access for staging.quant.dev

## Phase 1: Infrastructure (Terraform)

### 1.1 Initialize Terraform

```bash
cd infra/terraform/environments/staging
terraform init -backend-config="bucket=quant-terraform-state-staging"
```

### 1.2 Plan Infrastructure Changes

```bash
terraform plan -var-file=staging.tfvars -out=staging.plan
```

Review the plan carefully. Expected resources:

- VPC with 3 AZs
- EKS cluster (1.29)
- RDS PostgreSQL (db.t3.medium)
- ElastiCache Redis
- S3 buckets (per-service)
- CloudFront distribution
- Monitoring stack (CloudWatch, SNS)
- Backup verification (AWS Backup vault, plan, Lambda)
- Synthetic monitoring (CloudWatch Synthetics canaries)

### 1.3 Apply Infrastructure

```bash
terraform apply staging.plan
```

### 1.4 Verify Infrastructure

```bash
# Confirm EKS cluster is active
aws eks describe-cluster --name quant-staging-eks --query 'cluster.status'

# Confirm RDS is available
aws rds describe-db-instances --db-instance-identifier quant-staging-quantdb --query 'DBInstances[0].DBInstanceStatus'

# Confirm backup vault exists
aws backup describe-backup-vault --backup-vault-name quant-staging-backup-vault
```

## Phase 2: TLS Certificate Provisioning

### 2.1 Request ACM Certificate

```bash
aws acm request-certificate \
  --domain-name "staging.quant.dev" \
  --subject-alternative-names "*.staging.quant.dev" \
  --validation-method DNS \
  --region us-east-1
```

### 2.2 Validate Certificate

Add the DNS CNAME records to your DNS provider. Wait for validation:

```bash
aws acm describe-certificate \
  --certificate-arn <certificate-arn> \
  --query 'Certificate.Status'
```

### 2.3 Install cert-manager (if not present)

```bash
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true
```

## Phase 3: Application Deployment (ArgoCD)

### 3.1 Apply ArgoCD Configuration

```bash
kubectl apply -f infra/argocd/project.yaml
kubectl apply -f infra/argocd/applicationset.yaml
```

### 3.2 Verify ArgoCD Application

```bash
argocd app get quant-platform-staging
argocd app sync quant-platform-staging
```

### 3.3 Monitor Deployment

```bash
argocd app wait quant-platform-staging --timeout 600
kubectl get pods -n quant-staging -w
```

## Phase 4: Synthetic Monitor Setup

### 4.1 Verify Canaries Are Running

```bash
aws synthetics describe-canaries --name-prefix "quant-staging"
```

### 4.2 Check Initial Results

```bash
# Wait 10 minutes for first canary runs
aws synthetics get-canary-runs --name "quant-staging-identity" --max-results 5
```

### 4.3 Review Dashboard

Navigate to CloudWatch > Dashboards > quant-staging-synthetics

## Phase 5: 72-Hour Green Verification

The staging environment must show 72 continuous hours of green synthetic canaries before production cutover is approved.

### 5.1 Monitor Composite Alarm

```bash
aws cloudwatch describe-alarms --alarm-names "quant-staging-72h-green-threshold"
```

### 5.2 Track Green Hours

Record start time when all canaries first go green:

| Canary    | First Green | 24h Check | 48h Check | 72h Check |
| --------- | ----------- | --------- | --------- | --------- |
| identity  |             |           |           |           |
| chat-api  |             |           |           |           |
| mail-api  |             |           |           |           |
| ai-api    |             |           |           |           |
| sync-api  |             |           |           |           |
| ads-api   |             |           |           |           |
| tube-api  |             |           |           |           |
| neon-api  |             |           |           |           |
| edits-api |             |           |           |           |
| max-api   |             |           |           |           |
| ws-gw     |             |           |           |           |

### 5.3 Address Any Failures

If a canary fails during the 72h window:

1. Investigate root cause
2. Fix the issue
3. Restart the 72h timer

## Phase 6: Dogfooding Checklist

Before production cutover, team members must validate all core flows:

- [ ] Account registration and login
- [ ] Chat: send/receive messages, create channels
- [ ] Mail: compose, send, receive, search
- [ ] AI: generate responses, multi-turn conversations
- [ ] Sync: real-time collaboration on shared documents
- [ ] Ads: create campaign, serve ad, track impressions
- [ ] Tube: upload video, transcode, playback
- [ ] Neon: create/edit social posts, feed rendering
- [ ] Edits: create project, real-time collaborative editing
- [ ] Max: file upload, storage management
- [ ] WebSocket: real-time notifications, presence

## Rollback Procedure

### Application Rollback

```bash
argocd app rollback quant-platform-staging
```

### Infrastructure Rollback

```bash
cd infra/terraform/environments/staging
git checkout HEAD~1 -- .
terraform plan -var-file=staging.tfvars -out=rollback.plan
terraform apply rollback.plan
```

## Contacts

| Role                 | Contact              |
| -------------------- | -------------------- |
| Infrastructure Lead  | @infra-team          |
| Platform Engineering | @platform-team       |
| On-Call              | PagerDuty escalation |
