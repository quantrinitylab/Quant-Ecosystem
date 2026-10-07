import { describe, it, expect, beforeEach } from 'vitest';
import { PagerDutyIntegration } from '../pagerduty-integration.js';

describe('PagerDutyIntegration', () => {
  let pd: PagerDutyIntegration;

  beforeEach(() => {
    pd = new PagerDutyIntegration('test-routing-key');
  });

  it('createIncident returns incident with correct severity and status triggered', () => {
    const incident = pd.createIncident(
      'critical',
      'High Error Rate',
      'Error rate exceeded threshold',
      'quantmail',
    );

    expect(incident.id).toBeDefined();
    expect(incident.severity).toBe('critical');
    expect(incident.status).toBe('triggered');
    expect(incident.title).toBe('High Error Rate');
    expect(incident.service).toBe('quantmail');
  });

  it('resolveIncident updates status to resolved', () => {
    const incident = pd.createIncident('warning', 'Latency Alert', 'p95 latency high', 'quantube');

    const result = pd.resolveIncident(incident.id);
    expect(result).toBe(true);

    const updated = pd.getIncident(incident.id);
    expect(updated!.status).toBe('resolved');
  });

  it('acknowledgeIncident updates status to acknowledged', () => {
    const incident = pd.createIncident('error', 'Budget Alert', 'Budget exhausted', 'quantsync');

    const result = pd.acknowledgeIncident(incident.id);
    expect(result).toBe(true);

    const updated = pd.getIncident(incident.id);
    expect(updated!.status).toBe('acknowledged');
  });

  it('routeAlert directs to correct service', () => {
    expect(pd.routeAlert({ severity: 'critical', service: 'quantmail' })).toBe('primary-oncall');
    expect(pd.routeAlert({ severity: 'error', service: 'quantube' })).toBe('secondary-oncall');
    expect(pd.routeAlert({ severity: 'warning', service: 'quantsync' })).toBe('team-channel');
    expect(pd.routeAlert({ severity: 'info', service: 'quantdocs' })).toBe('monitoring-channel');
  });

  it('formatWebhookPayload matches PagerDuty Events API v2 format', () => {
    const incident = pd.createIncident(
      'critical',
      'Service Down',
      'quantmail is not responding',
      'quantmail',
    );

    const payload = pd.formatWebhookPayload(incident);

    expect(payload.routing_key).toBe('test-routing-key');
    expect(payload.event_action).toBe('trigger');
    expect(payload.dedup_key).toBe(incident.id);
    expect(payload.payload).toBeDefined();
    expect(payload.payload.summary).toBe('Service Down');
    expect(payload.payload.severity).toBe('critical');
    expect(payload.payload.source).toBe('quantmail');
    expect(payload.payload.component).toBe('quantmail');
    expect(payload.payload.custom_details).toBeDefined();
  });
});
