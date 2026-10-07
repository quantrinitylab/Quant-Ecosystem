// ============================================================================
// Workspace Audit Log - Activity tracking and export
// ============================================================================

import type { AuditEvent } from '../types.js';

interface AuditFilters {
  actorId?: string;
  action?: string;
  from?: number;
  to?: number;
}

export class WorkspaceAuditLog {
  private events: Map<string, AuditEvent[]> = new Map();

  logEvent(
    workspaceId: string,
    actorId: string,
    actorType: 'user' | 'agent',
    action: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): void {
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const event: AuditEvent = {
      id,
      workspaceId,
      actorId,
      actorType,
      action,
      resourceId,
      metadata: metadata ?? {},
      timestamp: Date.now(),
    };

    const workspaceEvents = this.events.get(workspaceId) ?? [];
    workspaceEvents.push(event);
    this.events.set(workspaceId, workspaceEvents);
  }

  getEvents(workspaceId: string, filters?: AuditFilters): AuditEvent[] {
    const workspaceEvents = this.events.get(workspaceId) ?? [];
    if (!filters) return workspaceEvents;

    return workspaceEvents.filter((event) => {
      if (filters.actorId && event.actorId !== filters.actorId) return false;
      if (filters.action && event.action !== filters.action) return false;
      if (filters.from && event.timestamp < filters.from) return false;
      if (filters.to && event.timestamp > filters.to) return false;
      return true;
    });
  }

  exportEvents(workspaceId: string, format: 'json' | 'csv'): string {
    const workspaceEvents = this.events.get(workspaceId) ?? [];

    if (format === 'json') {
      return JSON.stringify(workspaceEvents, null, 2);
    }

    // CSV format
    if (workspaceEvents.length === 0) return '';

    const headers = 'id,workspaceId,actorId,actorType,action,resourceId,timestamp';
    const rows = workspaceEvents.map(
      (e) =>
        `${e.id},${e.workspaceId},${e.actorId},${e.actorType},${e.action},${e.resourceId ?? ''},${e.timestamp}`,
    );
    return [headers, ...rows].join('\n');
  }

  getEventCount(workspaceId: string): number {
    const workspaceEvents = this.events.get(workspaceId);
    return workspaceEvents?.length ?? 0;
  }
}
