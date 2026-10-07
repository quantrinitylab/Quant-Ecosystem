import type { SwarmAuditEntry, AuditSeverity } from '../types.js';

export class SwarmAudit {
  private entries: SwarmAuditEntry[] = [];
  private retentionMs: number | null = null;

  log(entry: SwarmAuditEntry): void {
    if (!entry.severity) entry.severity = 'info';
    this.entries.push(entry);
  }

  setRetention(ms: number): void {
    this.retentionMs = ms;
  }

  prune(): number {
    if (this.retentionMs === null) return 0;
    const cutoff = Date.now() - this.retentionMs;
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.timestamp >= cutoff);
    return before - this.entries.length;
  }

  getByGoal(goalId: string): SwarmAuditEntry[] {
    return this.entries.filter((e) => e.goalId === goalId);
  }

  getByAgent(agentId: string): SwarmAuditEntry[] {
    return this.entries.filter((e) => e.agentId === agentId);
  }

  getBySeverity(severity: AuditSeverity): SwarmAuditEntry[] {
    return this.entries.filter((e) => e.severity === severity);
  }

  getByTimeRange(start: number, end: number): SwarmAuditEntry[] {
    return this.entries.filter((e) => e.timestamp >= start && e.timestamp <= end);
  }

  replay(goalId: string): SwarmAuditEntry[] {
    return this.getByGoal(goalId).sort((a, b) => a.timestamp - b.timestamp);
  }

  export(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  exportFiltered(goalId?: string, severity?: AuditSeverity): string {
    let filtered = [...this.entries];
    if (goalId) filtered = filtered.filter((e) => e.goalId === goalId);
    if (severity) filtered = filtered.filter((e) => e.severity === severity);
    return JSON.stringify(filtered, null, 2);
  }

  count(): number {
    return this.entries.length;
  }
}
