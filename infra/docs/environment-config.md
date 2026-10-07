# Quant Platform - Environment Configuration

## Overview

This document describes how environment variables are managed across development, staging, and production environments in the Quant Platform.

## Environment Hierarchy

```
development -> staging -> production
```

Each environment has its own configuration source:

| Environment | Source                          | Tool                   |
| ----------- | ------------------------------- | ---------------------- |
| Development | `.env` files + docker-compose   | Local files            |
| Staging     | Kubernetes Secrets + ConfigMaps | Sealed Secrets         |
| Production  | Kubernetes Secrets + ConfigMaps | Sealed Secrets + Vault |

## Configuration Categories

### Application Configuration

Standard configuration values shared across services:

| Variable       | Description                            | Example                 |
| -------------- | -------------------------------------- | ----------------------- |
| `NODE_ENV`     | Runtime environment                    | `production`            |
| `PORT`         | Service listen port                    | `3000`                  |
| `HOST`         | Service bind address                   | `0.0.0.0`               |
| `LOG_LEVEL`    | Pino log level                         | `info`                  |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | `https://app.quant.com` |

### Authentication

| Variable       | Description                     | Required In      |
| -------------- | ------------------------------- | ---------------- |
| `JWT_SECRET`   | HMAC signing key (min 32 chars) | All environments |
| `JWT_ISSUER`   | Token issuer claim              | All environments |
| `JWT_AUDIENCE` | Token audience claim            | All environments |
| `SESSION_TTL`  | Session duration                | All environments |

### Database

| Variable            | Description                   | Required In         |
| ------------------- | ----------------------------- | ------------------- |
| `DATABASE_URL`      | PostgreSQL connection string  | All environments    |
| `DATABASE_POOL_MIN` | Minimum pool connections      | Staging, Production |
| `DATABASE_POOL_MAX` | Maximum pool connections      | Staging, Production |
| `DATABASE_SSL`      | Enable SSL for DB connections | Staging, Production |

### Redis

| Variable             | Description             | Required In         |
| -------------------- | ----------------------- | ------------------- |
| `REDIS_URL`          | Redis connection string | All environments    |
| `REDIS_CLUSTER_MODE` | Enable cluster mode     | Production          |
| `REDIS_TLS`          | Enable TLS for Redis    | Staging, Production |

### AI Provider Configuration

| Variable            | Description                | Required In      |
| ------------------- | -------------------------- | ---------------- |
| `OPENAI_API_KEY`    | OpenAI API key             | All environments |
| `ANTHROPIC_API_KEY` | Anthropic API key          | All environments |
| `AI_MODEL_DEFAULT`  | Default model identifier   | All environments |
| `AI_RATE_LIMIT_RPM` | Requests per minute limit  | All environments |
| `AI_MAX_TOKENS`     | Maximum tokens per request | All environments |

### Observability

| Variable                      | Description                   | Required In         |
| ----------------------------- | ----------------------------- | ------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTel collector endpoint       | Staging, Production |
| `OTEL_SERVICE_NAME`           | Service name for traces       | All environments    |
| `METRICS_ENABLED`             | Enable Prometheus metrics     | All environments    |
| `TRACE_SAMPLE_RATE`           | Trace sampling rate (0.0-1.0) | All environments    |

### Rate Limiting

| Variable            | Description                | Required In      |
| ------------------- | -------------------------- | ---------------- |
| `RATE_LIMIT_MAX`    | Max requests per window    | All environments |
| `RATE_LIMIT_WINDOW` | Rate limit window duration | All environments |

## Helm Values Configuration

Environment-specific values are managed through Helm value files:

```
infra/helm/quant-platform/
  values.yaml              # Base defaults
  values-staging.yaml      # Staging overrides
  values-production.yaml   # Production overrides
```

### Adding a New Environment Variable

1. Add the variable to the base `values.yaml` with a sensible default:

```yaml
services:
  my-service:
    env:
      MY_NEW_VAR: 'default-value'
```

2. Override in environment-specific files as needed:

```yaml
# values-production.yaml
services:
  my-service:
    env:
      MY_NEW_VAR: 'production-value'
```

3. If the value is a secret, use Sealed Secrets instead:

```bash
# Create a sealed secret
echo -n "secret-value" | kubectl create secret generic my-secret \
  --from-file=MY_SECRET_VAR=/dev/stdin \
  --dry-run=client -o yaml | kubeseal -o yaml > sealed-secret.yaml
```

## Secrets Management

### Development

Secrets are stored in `.env.local` files (never committed to git):

```bash
# Copy the template
cp .env.example .env.local

# Fill in your local secrets
```

### Staging and Production

Secrets are managed through Kubernetes Sealed Secrets:

```bash
# Seal a secret for staging
kubeseal --controller-name=sealed-secrets \
  --controller-namespace=kube-system \
  --format yaml < secret.yaml > sealed-secret.yaml

# Apply the sealed secret
kubectl apply -f sealed-secret.yaml -n quant-staging
```

### Secret Rotation

To rotate secrets in production:

1. Generate new secret value
2. Create new Sealed Secret with updated value
3. Apply to cluster (triggers pod restart)
4. Verify services healthy after restart
5. Revoke old secret value

```bash
# Rotation script
./infra/scripts/rotate-secret.sh <secret-name> <namespace>
```

## Validation

The platform validates environment configuration at startup:

- Required variables must be present
- `JWT_SECRET` must be at least 32 characters in production
- `DATABASE_URL` must be a valid PostgreSQL connection string
- Numeric values must be within acceptable ranges

If validation fails, the service exits with a clear error message indicating which variables are missing or invalid.

## Adding a New Service

When adding a new service to the platform:

1. Define environment variables in the service's `AppConfig` type
2. Add defaults to `infra/helm/quant-platform/values.yaml`
3. Add any secrets to the Sealed Secrets configuration
4. Update environment-specific overrides in `values-staging.yaml` and `values-production.yaml`
5. Document new variables in this file

## Environment Parity

To maintain parity between environments:

- All services read configuration from the same set of environment variable names
- Only values differ between environments (not variable names)
- Feature flags are controlled via environment variables, not code branches
- Integration URLs (APIs, databases) are the only fundamentally different values

## Troubleshooting

### Missing Variable at Startup

```
[FATAL] Missing required environment variable: DATABASE_URL
```

Check that the ConfigMap or Secret is correctly mounted in the pod:

```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl get configmap <service>-config -n <namespace> -o yaml
```

### Variable Override Not Taking Effect

Helm value precedence (highest to lowest):

1. `--set` CLI flags
2. `-f values-production.yaml`
3. `-f values.yaml`

Verify the rendered template:

```bash
helm template quant-platform ./infra/helm/quant-platform \
  -f values.yaml \
  -f values-production.yaml | grep MY_VAR
```
