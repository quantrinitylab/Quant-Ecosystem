import type { AuditEntry } from '../types.js';

export class AuditLog {
  private entries: AuditEntry[] = [];

  log(entry: Omit<AuditEntry, 'id'>): AuditEntry {
    const full: AuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...entry,
    };
    this.entries.push(full);
    return full;
  }

  query(filters: {
    userId?: string;
    toolId?: string;
    action?: string;
    since?: number;
  }): AuditEntry[] {
    return this.entries.filter((e) => {
      if (filters.userId && e.userId !== filters.userId) return false;
      if (filters.toolId && e.toolId !== filters.toolId) return false;
      if (filters.action && e.action !== filters.action) return false;
      if (filters.since && e.timestamp < filters.since) return false;
      return true;
    });
  }

  getByExecution(executionId: string): AuditEntry[] {
    return this.entries.filter((e) => e.executionId === executionId);
  }

  getByUser(userId: string): AuditEntry[] {
    return this.entries.filter((e) => e.userId === userId);
  }

  getByTool(toolId: string): AuditEntry[] {
    return this.entries.filter((e) => e.toolId === toolId);
  }
}
