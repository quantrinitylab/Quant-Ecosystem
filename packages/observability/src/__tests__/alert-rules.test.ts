import { describe, it, expect } from 'vitest';
import { AlertRuleGenerator } from '../alert-rules.js';

describe('AlertRuleGenerator', () => {
  it('generates RED alerts for a service', () => {
    const generator = new AlertRuleGenerator();
    const group = generator.generateREDAlerts('quantmail');

    expect(group.name).toBe('quantmail_red_alerts');
    expect(group.rules).toHaveLength(4);

    const rateAlert = group.rules.find((r) => r.name.includes('high_request_rate'));
    expect(rateAlert).toBeDefined();
    expect(rateAlert!.severity).toBe('warning');
    expect(rateAlert!.runbook_url).toContain('high-request-rate');

    const errorAlert = group.rules.find((r) => r.name.includes('high_error_rate'));
    expect(errorAlert).toBeDefined();
    expect(errorAlert!.severity).toBe('critical');

    const p95Alert = group.rules.find((r) => r.name.includes('high_latency_p95'));
    expect(p95Alert).toBeDefined();
    expect(p95Alert!.severity).toBe('warning');

    const p99Alert = group.rules.find((r) => r.name.includes('high_latency_p99'));
    expect(p99Alert).toBeDefined();
    expect(p99Alert!.severity).toBe('critical');
  });

  it('generates USE alerts for a service', () => {
    const generator = new AlertRuleGenerator();
    const group = generator.generateUSEAlerts('quantchat');

    expect(group.name).toBe('quantchat_use_alerts');
    expect(group.rules).toHaveLength(4);

    const cpuAlert = group.rules.find((r) => r.name.includes('cpu_utilization'));
    expect(cpuAlert).toBeDefined();
    expect(cpuAlert!.labels['component']).toBe('utilization');

    const memAlert = group.rules.find((r) => r.name.includes('memory_saturation'));
    expect(memAlert).toBeDefined();
    expect(memAlert!.labels['component']).toBe('saturation');

    const netAlert = group.rules.find((r) => r.name.includes('network_errors'));
    expect(netAlert).toBeDefined();
    expect(netAlert!.labels['component']).toBe('errors');
  });

  it('generates SLO alerts with burn rate thresholds', () => {
    const generator = new AlertRuleGenerator();
    const group = generator.generateSLOAlerts('quantsync', {
      target: 0.999,
      metric: 'http_requests_total',
      window: '30d',
      burnRateThresholds: [
        { severity: 'critical', burnRate: 14.4, shortWindow: '5m', longWindow: '1h' },
        { severity: 'warning', burnRate: 6, shortWindow: '30m', longWindow: '6h' },
        { severity: 'info', burnRate: 3, shortWindow: '1h', longWindow: '24h' },
      ],
    });

    expect(group.name).toBe('quantsync_slo_alerts');
    expect(group.rules).toHaveLength(3);

    const criticalAlert = group.rules.find((r) => r.severity === 'critical');
    expect(criticalAlert).toBeDefined();
    expect(criticalAlert!.labels['burn_rate']).toBe('14.4x');
    expect(criticalAlert!.runbook_url).toContain('slo-burn-rate');
  });

  it('each alert includes required fields', () => {
    const generator = new AlertRuleGenerator();
    const group = generator.generateREDAlerts('quantai');

    for (const rule of group.rules) {
      expect(rule.name).toBeDefined();
      expect(rule.expr).toBeDefined();
      expect(rule.forDuration).toBeDefined();
      expect(rule.severity).toMatch(/^(critical|warning|info)$/);
      expect(rule.description).toBeDefined();
      expect(rule.runbook_url).toContain('https://docs.quant.internal/runbooks');
      expect(rule.labels).toBeDefined();
      expect(rule.annotations).toBeDefined();
    }
  });

  it('generates Prometheus YAML output', () => {
    const generator = new AlertRuleGenerator();
    const group = generator.generateREDAlerts('quantdocs');
    const yaml = generator.toPrometheusYAML([group]);

    expect(yaml).toContain('groups:');
    expect(yaml).toContain('quantdocs_red_alerts');
    expect(yaml).toContain('severity: critical');
    expect(yaml).toContain('runbook_url:');
  });

  it('uses custom runbook base URL', () => {
    const generator = new AlertRuleGenerator('https://wiki.example.com/runbooks');
    const group = generator.generateREDAlerts('quantdrive');

    expect(group.rules[0]!.runbook_url).toContain('https://wiki.example.com/runbooks');
  });
});
