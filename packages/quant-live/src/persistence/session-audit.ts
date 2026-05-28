import type { SessionAuditEntry, SessionAuditEventType } from '../types.js';

export class SessionAudit {
  private events: SessionAuditEntry[] = [];
  private idCounter = 0;
  private defaultSessionId?: string;

  constructor(sessionId?: string) {
    this.defaultSessionId = sessionId;
  }

  record(
    type: SessionAuditEventType,
    sessionId?: string,
    metadata?: Record<string, unknown>,
  ): void {
    const sid = sessionId ?? this.defaultSessionId ?? '';
    const event: SessionAuditEntry = Object.freeze({
      id: `sa-${++this.idCounter}`,
      sessionId: sid,
      type,
      timestamp: Date.now(),
      metadata,
    });
    this.events.push(event);
  }

  query(filter: {
    sessionId?: string;
    type?: SessionAuditEventType;
    since?: number;
    until?: number;
  }): SessionAuditEntry[] {
    return this.events.filter((e) => {
      if (filter.sessionId && e.sessionId !== filter.sessionId) return false;
      if (filter.type && e.type !== filter.type) return false;
      if (filter.since && e.timestamp < filter.since) return false;
      if (filter.until && e.timestamp > filter.until) return false;
      return true;
    });
  }

  getBySession(sessionId: string): SessionAuditEntry[] {
    return this.events.filter((e) => e.sessionId === sessionId);
  }

  exportJSON(): string {
    return JSON.stringify(this.events);
  }

  getCount(): number {
    return this.events.length;
  }
}
