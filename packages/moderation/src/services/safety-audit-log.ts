// ============================================================================
// Moderation - Safety Audit Log Service
// Immutable append-only audit log for all safety/moderation events
// ============================================================================

import type { SafetyAuditEntry, SafetyEventType } from '../types';

/**
 * SafetyAuditLogService - Immutable safety event recording
 *
 * Records all moderation and safety events in an append-only log.
 * Entries are frozen after creation and cannot be modified.
 * Supports filtered queries and statistical aggregation.
 */
export class SafetyAuditLogService {
  private entries: SafetyAuditEntry[];
  private entriesById: Map<string, SafetyAuditEntry>;
  private counter: number = 0;

  constructor() {
    this.entries = [];
    this.entriesById = new Map();
  }

  /** Record a new safety event (entry is frozen after creation) */
  record(params: {
    eventType: SafetyEventType;
    actor: string;
    targetUserId?: string;
    targetContentId?: string;
    action: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }): SafetyAuditEntry {
    this.counter++;

    const entry: SafetyAuditEntry = Object.freeze({
      id: `audit_${Date.now()}_${this.counter}`,
      eventType: params.eventType,
      actor: params.actor,
      targetUserId: params.targetUserId,
      targetContentId: params.targetContentId,
      action: params.action,
      reason: params.reason,
      metadata: Object.freeze(params.metadata || {}) as Record<string, unknown>,
      timestamp: Date.now(),
    });

    this.entries.push(entry);
    this.entriesById.set(entry.id, entry);

    return entry;
  }

  /** Query entries with optional filters */
  query(filters?: {
    eventType?: SafetyEventType;
    actor?: string;
    targetUserId?: string;
    startDate?: number;
    endDate?: number;
    limit?: number;
  }): SafetyAuditEntry[] {
    let results = [...this.entries];

    if (filters) {
      if (filters.eventType) {
        results = results.filter((e) => e.eventType === filters.eventType);
      }
      if (filters.actor) {
        results = results.filter((e) => e.actor === filters.actor);
      }
      if (filters.targetUserId) {
        results = results.filter((e) => e.targetUserId === filters.targetUserId);
      }
      if (filters.startDate) {
        results = results.filter((e) => e.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        results = results.filter((e) => e.timestamp <= filters.endDate!);
      }
      if (filters.limit) {
        results = results.slice(-filters.limit);
      }
    }

    return results;
  }

  /** Get a single entry by ID */
  getEntry(id: string): SafetyAuditEntry | undefined {
    return this.entriesById.get(id);
  }

  /** Get event type counts within a date range */
  getStats(startDate: number, endDate: number): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const entry of this.entries) {
      if (entry.timestamp >= startDate && entry.timestamp <= endDate) {
        stats[entry.eventType] = (stats[entry.eventType] || 0) + 1;
      }
    }

    return stats;
  }
}
