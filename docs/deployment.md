# Deployment Guide

## Local Development

### Prerequisites

- **Node.js 22+** (use nvm: `nvm use 22`)
- **pnpm 10** (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Docker & Docker Compose** (for PostgreSQL, Redis, Kafka, Meilisearch, Qdrant)
- **Git** (for repository access)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/Quant-Ecosystem.git
cd Quant-Ecosystem

# 2. Install all dependencies
pnpm install

# 3. Start infrastructure services
docker compose up -d

# 4. Run all apps in development mode
pnpm dev:all
```

### Individual App Development

```bash
# Run a specific app
pnpm turbo dev --filter=quantmail
pnpm turbo dev --filter=admin
pnpm turbo dev --filter=quantchat

# Run typecheck across all packages
pnpm turbo typecheck

# Run tests
pnpm turbo test

# Build everything
pnpm turbo build
```

### Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=postgresql://quant:quant_secret@localhost:5432/quantdb

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-secret-key-minimum-32-characters-long

# Search
MEILISEARCH_URL=http://localhost:7700
MEILI_MASTER_KEY=quant-search-dev-key

# AI (optional for local dev)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Grafana
GRAFANA_PASSWORD=admin
```

---

## Docker Deployment

### Docker Compose Services

The `docker-compose.yml` defines the full platform stack:

| Service       | Image                                       | Port        | Purpose                                |
| ------------- | ------------------------------------------- | ----------- | -------------------------------------- |
| `postgres`    | `ankane/pgvector:latest`                    | 5432        | Primary database with vector extension |
| `redis`       | `redis:7-alpine`                            | 6379        | Caching, sessions, pub/sub, queues     |
| `meilisearch` | `getmeili/meilisearch:latest`               | 7700        | Full-text search engine                |
| `jaeger`      | `jaegertracing/all-in-one:latest`           | 16686, 4318 | Distributed tracing                    |
| `prometheus`  | `prom/prometheus:latest`                    | 9090        | Metrics collection                     |
| `grafana`     | `grafana/grafana:latest`                    | 3200        | Dashboards and alerting                |
| `quantmail`   | Built from `apps/quantmail/Dockerfile`      | 3010        | Email + OAuth2 provider                |
| `quantchat`   | Built from `apps/quantchat/Dockerfile`      | 3015        | Instant messaging                      |
| `quantai`     | Built from `apps/quantai/Dockerfile`        | 3020        | AI assistant                           |
| `admin`       | Built from `apps/admin/Dockerfile`          | 3100        | Admin panel                            |
| `ws-gateway`  | Built from `services/ws-gateway/Dockerfile` | 8080        | WebSocket gateway                      |

### Running Full Stack

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f quantmail

# Stop everything
docker compose down

# Reset data volumes
docker compose down -v
```

### Health Checks

All services include Docker health checks:

- **PostgreSQL**: `pg_isready -U quant` (5s interval)
- **Redis**: `redis-cli ping` (5s interval)
- **Meilisearch**: `curl -f http://localhost:7700/health` (10s interval)

### Environment Variables Reference

| Variable                      | Required | Default                 | Description                       |
| ----------------------------- | -------- | ----------------------- | --------------------------------- |
| `DATABASE_URL`                | Yes      | -                       | PostgreSQL connection string      |
| `REDIS_URL`                   | Yes      | -                       | Redis connection string           |
| `JWT_SECRET`                  | Yes      | -                       | JWT signing secret (min 32 chars) |
| `NODE_ENV`                    | No       | `development`           | Environment mode                  |
| `MEILISEARCH_URL`             | No       | `http://localhost:7700` | Meilisearch endpoint              |
| `MEILI_MASTER_KEY`            | No       | `quant-search-dev-key`  | Meilisearch API key               |
| `KAFKA_BROKERS`               | No       | `localhost:9092`        | Kafka broker addresses            |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No       | `http://localhost:4318` | OpenTelemetry collector           |
| `OPENAI_API_KEY`              | No       | -                       | OpenAI API key for AI features    |
| `ANTHROPIC_API_KEY`           | No       | -                       | Anthropic API key for AI features |
| `GRAFANA_PASSWORD`            | No       | `admin`                 | Grafana admin password            |
| `WS_PORT`                     | No       | `3041`                  | WebSocket server port             |
| `HEALTH_PORT`                 | No       | varies                  | Health check endpoint port        |

---

## Kubernetes Deployment

### Helm Chart

The Helm chart is located at `infra/helm/quant-platform/`.

```bash
# Install the chart
helm install quant-platform infra/helm/quant-platform \
  --namespace quant \
  --create-namespace \
  -f infra/helm/quant-platform/values.yaml

# Upgrade
helm upgrade quant-platform infra/helm/quant-platform \
  --namespace quant \
  -f infra/helm/quant-platform/values.yaml

# Rollback
helm rollback quant-platform 1 --namespace quant
```

### Key Values Configuration

```yaml
# infra/helm/quant-platform/values.yaml

global:
  image:
    registry: ghcr.io/your-org
    pullPolicy: IfNotPresent

  env:
    NODE_ENV: production

# App replicas
quantmail:
  replicas: 3
  resources:
    requests:
      memory: '256Mi'
      cpu: '200m'
    limits:
      memory: '512Mi'
      cpu: '500m'

# WebSocket gateway (stateful)
wsGateway:
  replicas: 2
  resources:
    requests:
      memory: '512Mi'
      cpu: '500m'
  service:
    type: ClusterIP
    port: 8080

# Search indexer
searchIndexer:
  replicas: 2
  kafka:
    brokers: 'kafka:9092'
    groupId: 'search-indexer-group'
    topic: 'outbox.events'
```

### Secrets Management

```bash
# Create secrets
kubectl create secret generic quant-secrets \
  --namespace quant \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=REDIS_URL='redis://...' \
  --from-literal=JWT_SECRET='...' \
  --from-literal=MEILI_MASTER_KEY='...'

# Or use sealed-secrets for GitOps
kubeseal --format yaml < secret.yaml > sealed-secret.yaml
```

### Ingress Setup

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: quant-ingress
  namespace: quant
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: 'true'
    nginx.ingress.kubernetes.io/proxy-body-size: '50m'
    cert-manager.io/cluster-issuer: 'letsencrypt-prod'
spec:
  tls:
    - hosts:
        - mail.quant.app
        - chat.quant.app
        - admin.quant.app
      secretName: quant-tls
  rules:
    - host: mail.quant.app
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: quantmail
                port:
                  number: 3010
    - host: chat.quant.app
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: quantchat
                port:
                  number: 3015
    - host: admin.quant.app
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: admin
                port:
                  number: 3100
```

### Monitoring Stack

The `infra/` directory includes configurations for:

- **Prometheus** (`infra/prometheus/`): Metrics scraping from all services
- **Grafana** (`infra/grafana/`): Pre-built dashboards
- **OpenTelemetry** (`infra/otel/`): Trace collection and export
- **ArgoCD** (`infra/argocd/`): GitOps continuous deployment
- **Terraform** (`infra/terraform/`): Infrastructure as Code for cloud resources
- **Trivy** (`infra/trivy/`): Container security scanning

### Horizontal Pod Autoscaling

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: quantmail-hpa
  namespace: quant
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: quantmail
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```
