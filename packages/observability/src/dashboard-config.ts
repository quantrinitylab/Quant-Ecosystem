// ============================================================================
// Dashboard Config - Grafana Dashboard JSON Generation
// ============================================================================

import { DashboardPanel, DashboardConfig } from './types';

export class DashboardConfigGenerator {
  /**
   * Generate a service-specific Grafana dashboard configuration.
   */
  generateServiceDashboard(serviceName: string): DashboardConfig {
    const panels: DashboardPanel[] = [
      {
        title: 'Request Rate',
        type: 'graph',
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        targets: [
          {
            expr: `rate(http_requests_total{service="${serviceName}"}[5m])`,
            legendFormat: '{{method}} {{status_code}}',
          },
        ],
      },
      {
        title: 'Error Rate',
        type: 'graph',
        gridPos: { x: 12, y: 0, w: 12, h: 8 },
        targets: [
          {
            expr: `rate(http_requests_total{service="${serviceName}",status_code=~"5.."}[5m]) / rate(http_requests_total{service="${serviceName}"}[5m])`,
            legendFormat: 'Error Rate',
          },
        ],
      },
      {
        title: 'Latency P50',
        type: 'graph',
        gridPos: { x: 0, y: 8, w: 8, h: 8 },
        targets: [
          {
            expr: `histogram_quantile(0.5, rate(http_request_duration_seconds_bucket{service="${serviceName}"}[5m]))`,
            legendFormat: 'p50',
          },
        ],
      },
      {
        title: 'Latency P95',
        type: 'graph',
        gridPos: { x: 8, y: 8, w: 8, h: 8 },
        targets: [
          {
            expr: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{service="${serviceName}"}[5m]))`,
            legendFormat: 'p95',
          },
        ],
      },
      {
        title: 'Latency P99',
        type: 'graph',
        gridPos: { x: 16, y: 8, w: 8, h: 8 },
        targets: [
          {
            expr: `histogram_quantile(0.99, rate(http_request_duration_seconds_bucket{service="${serviceName}"}[5m]))`,
            legendFormat: 'p99',
          },
        ],
      },
      {
        title: 'SLO Burn Rate',
        type: 'gauge',
        gridPos: { x: 0, y: 16, w: 12, h: 6 },
        targets: [
          {
            expr: `${serviceName}:slo_burn_rate:5m`,
            legendFormat: 'Burn Rate (5m)',
          },
          {
            expr: `${serviceName}:slo_burn_rate:1h`,
            legendFormat: 'Burn Rate (1h)',
          },
        ],
      },
      {
        title: 'Error Budget Remaining',
        type: 'stat',
        gridPos: { x: 12, y: 16, w: 12, h: 6 },
        targets: [
          {
            expr: `${serviceName}:error_budget_remaining`,
            legendFormat: 'Budget Remaining %',
          },
        ],
      },
    ];

    return {
      title: `${serviceName} Service Dashboard`,
      uid: `${serviceName}-service`,
      panels,
      tags: [serviceName, 'service', 'auto-generated'],
      editable: true,
      refresh: '30s',
    };
  }

  /**
   * Generate a multi-service overview dashboard.
   */
  generateOverviewDashboard(services: string[]): DashboardConfig {
    const panels: DashboardPanel[] = [];
    let yOffset = 0;

    for (let i = 0; i < services.length; i++) {
      const service = services[i]!;
      const col = (i % 2) * 12;
      const row = Math.floor(i / 2) * 8;

      panels.push({
        title: `${service} - Request Rate`,
        type: 'stat',
        gridPos: { x: col, y: row, w: 6, h: 4 },
        targets: [
          {
            expr: `sum(rate(http_requests_total{service="${service}"}[5m]))`,
            legendFormat: 'req/s',
          },
        ],
      });

      panels.push({
        title: `${service} - Error Rate`,
        type: 'stat',
        gridPos: { x: col + 6, y: row, w: 6, h: 4 },
        targets: [
          {
            expr: `sum(rate(http_requests_total{service="${service}",status_code=~"5.."}[5m])) / sum(rate(http_requests_total{service="${service}"}[5m]))`,
            legendFormat: 'error %',
          },
        ],
      });

      panels.push({
        title: `${service} - P95 Latency`,
        type: 'stat',
        gridPos: { x: col, y: row + 4, w: 6, h: 4 },
        targets: [
          {
            expr: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="${service}"}[5m])) by (le))`,
            legendFormat: 'p95',
          },
        ],
      });

      panels.push({
        title: `${service} - Error Budget`,
        type: 'gauge',
        gridPos: { x: col + 6, y: row + 4, w: 6, h: 4 },
        targets: [
          {
            expr: `${service}:error_budget_remaining`,
            legendFormat: 'budget %',
          },
        ],
      });

      yOffset = row + 8;
    }

    void yOffset;

    return {
      title: 'Services Overview Dashboard',
      uid: 'services-overview',
      panels,
      tags: ['overview', 'multi-service', 'auto-generated'],
      editable: true,
      refresh: '1m',
    };
  }
}
