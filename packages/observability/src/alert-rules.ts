// ============================================================================
// Alert Rule Generator - Programmatic Prometheus Alert Rule Generation
// ============================================================================

import { AlertRule, AlertRuleGroup, SLOAlertConfig } from './types';

export class AlertRuleGenerator {
  private baseRunbookUrl: string;

  constructor(baseRunbookUrl = 'https://docs.quant.internal/runbooks') {
    this.baseRunbookUrl = baseRunbookUrl;
  }

  /**
   * Generate RED (Rate, Errors, Duration) alerts for a service.
   */
  generateREDAlerts(service: string): AlertRuleGroup {
    const rules: AlertRule[] = [
      {
        name: `${service}_high_request_rate`,
        expr: `sum(rate(http_requests_total{service="${service}"}[5m])) > 1000`,
        forDuration: '5m',
        severity: 'warning',
        description: `High request rate detected on ${service}`,
        runbook_url: `${this.baseRunbookUrl}/high-request-rate`,
        labels: { service, alert_type: 'red', component: 'rate' },
        annotations: {
          summary: `High request rate on ${service}`,
          description: `Service ${service} is receiving more than 1000 req/s for 5 minutes.`,
        },
      },
      {
        name: `${service}_high_error_rate`,
        expr: `sum(rate(http_requests_total{service="${service}",status_code=~"5.."}[5m])) / sum(rate(http_requests_total{service="${service}"}[5m])) > 0.01`,
        forDuration: '5m',
        severity: 'critical',
        description: `High error rate detected on ${service}`,
        runbook_url: `${this.baseRunbookUrl}/high-error-rate`,
        labels: { service, alert_type: 'red', component: 'errors' },
        annotations: {
          summary: `High error rate on ${service}`,
          description: `Service ${service} error rate is above 1% for 5 minutes.`,
        },
      },
      {
        name: `${service}_high_latency_p95`,
        expr: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{service="${service}"}[5m])) by (le)) > 0.5`,
        forDuration: '5m',
        severity: 'warning',
        description: `High p95 latency detected on ${service}`,
        runbook_url: `${this.baseRunbookUrl}/high-latency`,
        labels: { service, alert_type: 'red', component: 'duration' },
        annotations: {
          summary: `High p95 latency on ${service}`,
          description: `Service ${service} p95 latency is above 500ms for 5 minutes.`,
        },
      },
      {
        name: `${service}_high_latency_p99`,
        expr: `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{service="${service}"}[5m])) by (le)) > 1.0`,
        forDuration: '5m',
        severity: 'critical',
        description: `High p99 latency detected on ${service}`,
        runbook_url: `${this.baseRunbookUrl}/high-latency`,
        labels: { service, alert_type: 'red', component: 'duration' },
        annotations: {
          summary: `High p99 latency on ${service}`,
          description: `Service ${service} p99 latency is above 1s for 5 minutes.`,
        },
      },
    ];

    return { name: `${service}_red_alerts`, rules };
  }

  /**
   * Generate USE (Utilization, Saturation, Errors) alerts for a service.
   */
  generateUSEAlerts(service: string): AlertRuleGroup {
    const rules: AlertRule[] = [
      {
        name: `${service}_high_cpu_utilization`,
        expr: `rate(container_cpu_usage_seconds_total{pod=~"${service}-.*"}[5m]) / container_spec_cpu_quota * 100 > 80`,
        forDuration: '10m',
        severity: 'warning',
        description: `High CPU utilization on ${service}`,
        runbook_url: `${this.baseRunbookUrl}/high-cpu`,
        labels: { service, alert_type: 'use', component: 'utilization' },
        annotations: {
          summary: `High CPU utilization on ${service}`,
          description: `Service ${service} CPU utilization is above 80% for 10 minutes.`,
        },
      },
      {
        name: `${service}_memory_saturation`,
        expr: `container_memory_working_set_bytes{pod=~"${service}-.*"} / container_spec_memory_limit_bytes > 0.85`,
        forDuration: '10m',
        severity: 'warning',
        description: `Memory saturation on ${service}`,
        runbook_url: `${this.baseRunbookUrl}/memory-saturation`,
        labels: { service, alert_type: 'use', component: 'saturation' },
        annotations: {
          summary: `Memory saturation on ${service}`,
          description: `Service ${service} memory usage is above 85% of limit for 10 minutes.`,
        },
      },
      {
        name: `${service}_network_errors`,
        expr: `sum(rate(node_network_receive_errs_total{pod=~"${service}-.*"}[5m])) + sum(rate(node_network_transmit_errs_total{pod=~"${service}-.*"}[5m])) > 10`,
        forDuration: '5m',
        severity: 'warning',
        description: `Network errors detected on ${service}`,
        runbook_url: `${this.baseRunbookUrl}/network-errors`,
        labels: { service, alert_type: 'use', component: 'errors' },
        annotations: {
          summary: `Network errors on ${service}`,
          description: `Service ${service} is experiencing network errors.`,
        },
      },
      {
        name: `${service}_disk_saturation`,
        expr: `(node_filesystem_size_bytes{pod=~"${service}-.*"} - node_filesystem_free_bytes{pod=~"${service}-.*"}) / node_filesystem_size_bytes{pod=~"${service}-.*"} > 0.9`,
        forDuration: '10m',
        severity: 'critical',
        description: `Disk saturation on ${service}`,
        runbook_url: `${this.baseRunbookUrl}/disk-pressure`,
        labels: { service, alert_type: 'use', component: 'saturation' },
        annotations: {
          summary: `Disk saturation on ${service}`,
          description: `Service ${service} disk usage is above 90% for 10 minutes.`,
        },
      },
    ];

    return { name: `${service}_use_alerts`, rules };
  }

  /**
   * Generate SLO-based alerts with multi-burn-rate windows.
   */
  generateSLOAlerts(service: string, sloConfig: SLOAlertConfig): AlertRuleGroup {
    const rules: AlertRule[] = [];

    for (const threshold of sloConfig.burnRateThresholds) {
      const errorBudget = 1 - sloConfig.target;
      const burnRateExpr = `(1 - (sum(rate(${sloConfig.metric}{service="${service}",status_code!~"5.."}[${threshold.longWindow}])) / sum(rate(${sloConfig.metric}{service="${service}"}[${threshold.longWindow}])))) / ${errorBudget}`;

      rules.push({
        name: `${service}_slo_burn_rate_${threshold.severity}`,
        expr: `${burnRateExpr} > ${threshold.burnRate} and (1 - (sum(rate(${sloConfig.metric}{service="${service}",status_code!~"5.."}[${threshold.shortWindow}])) / sum(rate(${sloConfig.metric}{service="${service}"}[${threshold.shortWindow}])))) / ${errorBudget} > ${threshold.burnRate}`,
        forDuration: '2m',
        severity: threshold.severity,
        description: `SLO burn rate ${threshold.severity} alert for ${service}`,
        runbook_url: `${this.baseRunbookUrl}/slo-burn-rate`,
        labels: {
          service,
          alert_type: 'slo',
          burn_rate: `${threshold.burnRate}x`,
          slo_target: `${sloConfig.target}`,
        },
        annotations: {
          summary: `SLO burn rate ${threshold.severity} on ${service}`,
          description: `Service ${service} is burning error budget at ${threshold.burnRate}x rate over ${threshold.longWindow} window.`,
        },
      });
    }

    return { name: `${service}_slo_alerts`, rules };
  }

  /**
   * Export alert rules in Prometheus YAML format.
   */
  toPrometheusYAML(groups: AlertRuleGroup[]): string {
    const lines: string[] = ['groups:'];

    for (const group of groups) {
      lines.push(`  - name: ${group.name}`);
      lines.push('    rules:');

      for (const rule of group.rules) {
        lines.push(`      - alert: ${rule.name}`);
        lines.push(`        expr: ${rule.expr}`);
        lines.push(`        for: ${rule.forDuration}`);
        lines.push('        labels:');
        lines.push(`          severity: ${rule.severity}`);
        for (const [key, value] of Object.entries(rule.labels)) {
          lines.push(`          ${key}: "${value}"`);
        }
        lines.push('        annotations:');
        lines.push(`          summary: "${rule.annotations['summary']}"`);
        lines.push(`          description: "${rule.annotations['description']}"`);
        lines.push(`          runbook_url: "${rule.runbook_url}"`);
      }
    }

    return lines.join('\n');
  }
}
