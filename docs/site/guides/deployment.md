# Deployment Guide

This guide covers deploying Quant in various configurations for Enterprise customers.

## Deployment Options

### Quant Cloud (Default)

Fully managed by Quant:

- Multi-region availability
- Automatic scaling
- Zero maintenance
- 99.99% uptime SLA (Enterprise)

### Self-Hosted

Run Quant on your own infrastructure:

- Full control over data location
- Custom security policies
- Air-gapped deployment option
- Kubernetes or Docker Compose

### Hybrid

Mix of cloud and self-hosted:

- Keep sensitive data on-premises
- Use Quant Cloud for non-sensitive services
- Custom routing rules

## Self-Hosted Deployment

### Prerequisites

- Kubernetes cluster (1.28+)
- PostgreSQL 15+
- Redis 7+
- S3-compatible storage (MinIO, Ceph, AWS S3)
- 16GB RAM minimum (32GB recommended)
- 100GB storage minimum

### Helm Installation

```bash
# Add the Quant Helm repository
helm repo add quant https://charts.quant.app
helm repo update

# Create namespace
kubectl create namespace quant

# Install with custom values
helm install quant quant/quant-platform \
  --namespace quant \
  --values values.yaml
```

### Configuration (values.yaml)

```yaml
global:
  domain: quant.yourcompany.com
  tls:
    enabled: true
    issuer: letsencrypt-prod

database:
  host: postgres.internal
  port: 5432
  name: quant
  credentials:
    secretName: quant-db-credentials

redis:
  host: redis.internal
  port: 6379

storage:
  type: s3
  bucket: quant-data
  region: us-east-1
  endpoint: https://s3.amazonaws.com

services:
  mail:
    replicas: 3
  docs:
    replicas: 3
  sync:
    replicas: 5
  ai:
    replicas: 2
    gpu: true
```

### Docker Compose (Development/Small Teams)

```bash
# Clone the deployment repository
git clone https://github.com/quant-app/self-hosted.git
cd self-hosted

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start all services
docker compose up -d

# Run migrations
docker compose exec api quant-migrate up

# Verify
docker compose exec api quant-health
```

## Updating

### Helm Updates

```bash
helm repo update
helm upgrade quant quant/quant-platform \
  --namespace quant \
  --values values.yaml
```

### Rolling Updates

Quant supports zero-downtime rolling updates:

1. New pods start with updated image
2. Health checks verify readiness
3. Traffic shifts to new pods
4. Old pods terminate gracefully

### Canary Deployments (Enterprise)

```bash
# Deploy canary (1% traffic)
helm upgrade quant quant/quant-platform \
  --set canary.enabled=true \
  --set canary.weight=1

# Monitor metrics for 30 minutes
# If healthy, promote
helm upgrade quant quant/quant-platform \
  --set canary.enabled=true \
  --set canary.weight=100
```

## Monitoring

### Health Endpoints

- `/health` - Basic health check
- `/health/ready` - Readiness probe
- `/health/live` - Liveness probe
- `/metrics` - Prometheus metrics

### Grafana Dashboards

Import Quant dashboards:

```bash
kubectl apply -f grafana-dashboards/
```

Available dashboards:

- Service Overview
- Request Latency
- Error Rates
- Database Performance
- Sync Engine Metrics
- AI Inference Stats

## Backup and Recovery

### Automated Backups

```yaml
# In values.yaml
backup:
  enabled: true
  schedule: '0 2 * * *' # Daily at 2 AM
  retention: 30 # Keep 30 days
  storage:
    bucket: quant-backups
```

### Manual Backup

```bash
# Database backup
kubectl exec -n quant deploy/quant-api -- quant-backup create

# Verify backup
kubectl exec -n quant deploy/quant-api -- quant-backup verify latest
```

### Disaster Recovery

1. Restore from backup: `quant-backup restore <backup-id>`
2. Verify data integrity: `quant-verify --full`
3. Update DNS if needed
4. Notify users of any data loss window

## Security Hardening

- Enable network policies to restrict pod-to-pod communication
- Use Pod Security Standards (restricted)
- Rotate secrets regularly via external secret management
- Enable audit logging for all API access
- Configure WAF rules for the ingress
