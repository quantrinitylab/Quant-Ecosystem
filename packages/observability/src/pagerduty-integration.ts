// ============================================================================
// PagerDuty Integration - Alert Webhook Integration
// ============================================================================

import { PagerDutySeverity, PagerDutyIncident, PagerDutyPayload } from './types';

export class PagerDutyIntegration {
  private routingKey: string;
  private incidents: Map<string, PagerDutyIncident> = new Map();
  private incidentCounter: number = 0;
  private maxIncidents: number;

  constructor(routingKey: string, options?: { maxIncidents?: number }) {
    this.routingKey = routingKey;
    this.maxIncidents = options?.maxIncidents ?? 1000;
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
    this.evictOldResolvedIncidents();
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

  /**
   * Evict the oldest resolved incidents when the map exceeds maxIncidents.
   */
  private evictOldResolvedIncidents(): void {
    if (this.incidents.size <= this.maxIncidents) return;

    // Collect resolved incidents sorted by updatedAt (oldest first)
    const resolvedEntries: Array<[string, PagerDutyIncident]> = [];
    for (const [key, incident] of this.incidents) {
      if (incident.status === 'resolved') {
        resolvedEntries.push([key, incident]);
      }
    }

    resolvedEntries.sort((a, b) => a[1].updatedAt - b[1].updatedAt);

    // Remove oldest resolved incidents until we are at or below maxIncidents
    let toRemove = this.incidents.size - this.maxIncidents;
    for (const [key] of resolvedEntries) {
      if (toRemove <= 0) break;
      this.incidents.delete(key);
      toRemove--;
    }
  }
}
