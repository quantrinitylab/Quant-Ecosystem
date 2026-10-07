import { randomUUID } from 'crypto';
import type { AuditEvent, CreateAuditEventInput, AuditQueryInput } from './types';

export class AuditLogger {
  private events: AuditEvent[] = [];

  log(input: CreateAuditEventInput): AuditEvent {
    const event: AuditEvent = {
      id: randomUUID(),
      userId: input.userId,
      orgId: input.orgId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      metadata: input.metadata ?? {},
      ip: input.ip,
      userAgent: input.userAgent,
      timestamp: new Date(),
    };

    this.events.push(event);
    return event;
  }

  query(filters: Partial<AuditQueryInput>): AuditEvent[] {
    let results = [...this.events];

    if (filters.userId) {
      results = results.filter((e) => e.userId === filters.userId);
    }

    if (filters.action) {
      results = results.filter((e) => e.action === filters.action);
    }

    if (filters.resource) {
      results = results.filter((e) => e.resource === filters.resource);
    }

    if (filters.startDate) {
      results = results.filter((e) => e.timestamp >= filters.startDate!);
    }

    if (filters.endDate) {
      results = results.filter((e) => e.timestamp <= filters.endDate!);
    }

    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 100;

    return results.slice(offset, offset + limit);
  }

  getByUser(userId: string): AuditEvent[] {
    return this.events.filter((e) => e.userId === userId);
  }

  getByResource(resource: string, resourceId?: string): AuditEvent[] {
    return this.events.filter((e) => {
      if (e.resource !== resource) return false;
      if (resourceId && e.resourceId !== resourceId) return false;
      return true;
    });
  }

  count(filters?: Partial<AuditQueryInput>): number {
    if (!filters) return this.events.length;

    let results = [...this.events];

    if (filters.userId) {
      results = results.filter((e) => e.userId === filters.userId);
    }

    if (filters.action) {
      results = results.filter((e) => e.action === filters.action);
    }

    if (filters.resource) {
      results = results.filter((e) => e.resource === filters.resource);
    }

    if (filters.startDate) {
      results = results.filter((e) => e.timestamp >= filters.startDate!);
    }

    if (filters.endDate) {
      results = results.filter((e) => e.timestamp <= filters.endDate!);
    }

    return results.length;
  }

  /** Internal access for retention/deletion operations */
  _getEvents(): AuditEvent[] {
    return this.events;
  }

  /** Internal method to remove events by predicate */
  _removeWhere(predicate: (event: AuditEvent) => boolean): number {
    const before = this.events.length;
    this.events = this.events.filter((e) => !predicate(e));
    return before - this.events.length;
  }
}
