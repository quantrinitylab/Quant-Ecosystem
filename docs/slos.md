# Service-Level Objectives (SLOs)

This document defines per-service SLO baselines and performance budgets for the Quant platform.

## Global SLO Targets

| Metric       | Target  | Window         |
| ------------ | ------- | -------------- |
| Availability | 99.9%   | 30-day rolling |
| Latency P95  | < 200ms | 30-day rolling |
| Latency P99  | < 500ms | 30-day rolling |
| Error Rate   | < 1%    | 30-day rolling |

## Per-Service SLO Definitions

### QuantMail

| Route                 | P50   | P95   | P99   | Error Budget | Min Throughput |
| --------------------- | ----- | ----- | ----- | ------------ | -------------- |
| `POST /api/mail/send` | 100ms | 300ms | 800ms | 0.5%         | 500 req/s      |
| `GET /api/mail/inbox` | 50ms  | 150ms | 300ms | 0.1%         | 1000 req/s     |
| `GET /api/mail/:id`   | 30ms  | 80ms  | 150ms | 0.1%         | 2000 req/s     |

### QuantUbe

| Route                        | P50   | P95    | P99    | Error Budget | Min Throughput |
| ---------------------------- | ----- | ------ | ------ | ------------ | -------------- |
| `GET /api/videos/feed`       | 80ms  | 200ms  | 500ms  | 0.5%         | 2000 req/s     |
| `POST /api/videos/upload`    | 500ms | 2000ms | 5000ms | 1.0%         | 100 req/s      |
| `GET /api/videos/:id/stream` | 50ms  | 100ms  | 200ms  | 0.1%         | 5000 req/s     |

### QuantSync

| Route              | P50  | P95  | P99   | Error Budget | Min Throughput |
| ------------------ | ---- | ---- | ----- | ------------ | -------------- |
| `WS /sync/connect` | 30ms | 80ms | 150ms | 0.1%         | 10000 conn/s   |
| `POST /sync/push`  | 20ms | 50ms | 100ms | 0.1%         | 5000 req/s     |
| `GET /sync/pull`   | 20ms | 50ms | 100ms | 0.1%         | 5000 req/s     |

### QuantGram

| Route                     | P50  | P95   | P99   | Error Budget | Min Throughput |
| ------------------------- | ---- | ----- | ----- | ------------ | -------------- |
| `GET /api/feed`           | 60ms | 150ms | 300ms | 0.5%         | 3000 req/s     |
| `POST /api/posts`         | 80ms | 200ms | 500ms | 0.5%         | 500 req/s      |
| `POST /api/messages/send` | 30ms | 80ms  | 150ms | 0.1%         | 2000 req/s     |

### QuantCast

| Route                         | P50  | P95   | P99   | Error Budget | Min Throughput |
| ----------------------------- | ---- | ----- | ----- | ------------ | -------------- |
| `GET /api/podcast/feed`       | 50ms | 150ms | 300ms | 0.5%         | 1000 req/s     |
| `GET /api/podcast/:id/stream` | 40ms | 100ms | 200ms | 0.1%         | 3000 req/s     |

### QuantDocs

| Route                 | P50  | P95   | P99   | Error Budget | Min Throughput |
| --------------------- | ---- | ----- | ----- | ------------ | -------------- |
| `GET /api/docs/:id`   | 30ms | 80ms  | 150ms | 0.1%         | 2000 req/s     |
| `PUT /api/docs/:id`   | 50ms | 150ms | 300ms | 0.5%         | 500 req/s      |
| `WS /docs/:id/collab` | 20ms | 50ms  | 100ms | 0.1%         | 5000 conn/s    |

### QuantDrive

| Route                         | P50   | P95    | P99    | Error Budget | Min Throughput |
| ----------------------------- | ----- | ------ | ------ | ------------ | -------------- |
| `GET /api/files/list`         | 50ms  | 150ms  | 300ms  | 0.1%         | 1000 req/s     |
| `POST /api/files/upload`      | 200ms | 1000ms | 3000ms | 1.0%         | 200 req/s      |
| `GET /api/files/:id/download` | 50ms  | 100ms  | 200ms  | 0.1%         | 2000 req/s     |

### QuantForum

| Route                         | P50  | P95   | P99   | Error Budget | Min Throughput |
| ----------------------------- | ---- | ----- | ----- | ------------ | -------------- |
| `GET /api/threads`            | 50ms | 150ms | 300ms | 0.5%         | 1000 req/s     |
| `POST /api/threads/:id/reply` | 60ms | 150ms | 300ms | 0.5%         | 500 req/s      |

### QuantMarket

| Route                      | P50   | P95   | P99   | Error Budget | Min Throughput |
| -------------------------- | ----- | ----- | ----- | ------------ | -------------- |
| `GET /api/products/search` | 80ms  | 200ms | 500ms | 0.5%         | 1000 req/s     |
| `POST /api/orders`         | 100ms | 300ms | 800ms | 0.1%         | 200 req/s      |
| `GET /api/orders/:id`      | 30ms  | 80ms  | 150ms | 0.1%         | 1000 req/s     |

## Performance Budget Configuration

Performance budgets are enforced via the `PerformanceBudgetChecker` class in `@quant/performance`. Each route is configured with:

- **Latency targets**: p50, p95, and p99 percentile latency thresholds
- **Error rate budget**: Maximum acceptable error rate (fraction of requests)
- **Throughput minimum**: Minimum requests per second the service must handle

## Burn Rate Alerts

SLO violations trigger burn rate alerts:

| Window  | Burn Rate | Severity        |
| ------- | --------- | --------------- |
| 1 hour  | 14.4x     | Critical (page) |
| 6 hours | 6x        | High (page)     |
| 1 day   | 3x        | Medium (ticket) |
| 3 days  | 1x        | Low (log)       |

## Error Budget Policy

- When error budget is exhausted (>100% consumed): freeze feature releases, focus on reliability
- When error budget consumption is >80%: slow down deploys, increase testing
- When error budget consumption is <50%: normal velocity, encouraged to take risks
