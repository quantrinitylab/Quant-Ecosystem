// ============================================================================
// PagerDuty Integration - Alert Webhook Integration
// ============================================================================

import { PagerDutySeverity, PagerDutyIncident, PagerDutyPayload } from './types';

export class PagerDutyIntegration {
  private routingKey: string;
  private incidents: Map<string, PagerDutyIncident> = new Map();
  private incidentCounter: number = 0;

  constructor(routingKey: string) {
    this.routingKey = routingKey;
  }

  /**
   * Create a new incident.
   */
  createIncident(
    severity: PagerDutySeverity,
    title: string,
    description: string,
    service: string,
  ): PagerDutyIncident {
    const id = `incident_${++this.incidentCounter}_${Date.now().toString(36)}`;
    const now = Date.now();

    const incident: PagerDutyIncident = {
      id,
      severity,
      title,
      description,
      service,
      status: 'triggered',
      createdAt: now,
      updatedAt: now,
      notes: [],
    };

    this.incidents.set(id, incident);
    return incident;
  }

  /**
   * Mark an incident as resolved.
   */
  resolveIncident(incidentId: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.status = 'resolved';
    incident.updatedAt = Date.now();
    return true;
  }

  /**
   * Mark an incident as acknowledged.
   */
  acknowledgeIncident(incidentId: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.status = 'acknowledged';
    incident.updatedAt = Date.now();
    return true;
  }

  /**
   * Add a note to an incident.
   */
  addNote(incidentId: string, note: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.notes.push(note);
    incident.updatedAt = Date.now();
    return true;
  }

  /**
   * Route an alert to the appropriate service based on severity.
   */
  routeAlert(alert: { severity: string; service: string }): string {
    // Route based on severity and service
    const severityRouting: Record<string, string> = {
      critical: 'primary-oncall',
      error: 'secondary-oncall',
      warning: 'team-channel',
      info: 'monitoring-channel',
    };

    return severityRouting[alert.severity] ?? 'default-channel';
  }

  /**
   * Format a PagerDuty Events API v2 webhook payload.
   */
  formatWebhookPayload(incident: PagerDutyIncident): PagerDutyPayload {
    let eventAction: 'trigger' | 'acknowledge' | 'resolve';
    switch (incident.status) {
      case 'acknowledged':
        eventAction = 'acknowledge';
        break;
      case 'resolved':
        eventAction = 'resolve';
        break;
      default:
        eventAction = 'trigger';
    }

    return {
      routing_key: this.routingKey,
      event_action: eventAction,
      dedup_key: incident.id,
      payload: {
        summary: incident.title,
        severity: incident.severity,
        source: incident.service,
        component: incident.service,
        custom_details: {
          description: incident.description,
          service: incident.service,
          created_at: incident.createdAt,
          notes: incident.notes,
        },
      },
    };
  }

  /**
   * Get all incidents.
   */
  getIncidents(): PagerDutyIncident[] {
    return Array.from(this.incidents.values());
  }

  /**
   * Get a specific incident by ID.
   */
  getIncident(id: string): PagerDutyIncident | null {
    return this.incidents.get(id) ?? null;
  }
}
