import { CodeAuditEntry } from '../types.js';

export class CodeAuditLog {
  private entries: CodeAuditEntry[] = [];

  addEntry(
    action: string,
    details: string,
    opts?: { tokenCost?: number; filesChanged?: string[] },
  ): CodeAuditEntry {
    const entry: CodeAuditEntry = {
      id: `audit-${this.entries.length + 1}`,
      timestamp: Date.now(),
      action,
      details,
      ...opts,
    };
    this.entries.push(entry);
    return entry;
  }

  getEntries(): CodeAuditEntry[] {
    return [...this.entries];
  }

  getTokenSpend(): number {
    return this.entries.reduce((sum, e) => sum + (e.tokenCost ?? 0), 0);
  }
}

export class MergeGate {
  private approvals = new Map<string, string>();
  constructor(public requiresSignoff = true) {}

  approve(taskId: string, approver: string) {
    this.approvals.set(taskId, approver);
  }

  isApproved(taskId: string): boolean {
    if (!this.requiresSignoff) return true;
    return this.approvals.has(taskId);
  }
}
