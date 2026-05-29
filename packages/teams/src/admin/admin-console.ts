import type { AdminPolicy, AuditEntry } from '../types.js';

export interface PolicyInput {
  name: string;
  rules: string[];
  scope: string;
  enforcement: 'strict' | 'warn' | 'log';
}

export interface AuditFilters {
  actorId?: string;
  action?: string;
  startTime?: number;
  endTime?: number;
}

export class AdminConsoleService {
  private policies = new Map<string, AdminPolicy[]>();
  private auditLog = new Map<string, AuditEntry[]>();

  async getPolicies(orgId: string): Promise<AdminPolicy[]> {
    return this.policies.get(orgId) ?? [];
  }

  async createPolicy(orgId: string, policy: PolicyInput): Promise<AdminPolicy> {
    const newPolicy: AdminPolicy = {
      id: crypto.randomUUID(),
      orgId,
      name: policy.name,
      rules: policy.rules,
      scope: policy.scope,
      enforcement: policy.enforcement,
    };
    const orgPolicies = this.policies.get(orgId) ?? [];
    orgPolicies.push(newPolicy);
    this.policies.set(orgId, orgPolicies);
    return newPolicy;
  }

  async updatePolicy(
    policyId: string,
    updates: Partial<PolicyInput>,
  ): Promise<AdminPolicy | undefined> {
    for (const [, orgPolicies] of this.policies) {
      const policy = orgPolicies.find((p) => p.id === policyId);
      if (policy) {
        Object.assign(policy, updates);
        return policy;
      }
    }
    return undefined;
  }

  async getAuditLog(orgId: string, filters?: AuditFilters): Promise<AuditEntry[]> {
    const entries = this.auditLog.get(orgId) ?? [];
    if (!filters) return entries;
    return entries.filter((entry) => {
      if (filters.actorId && entry.actorId !== filters.actorId) return false;
      if (filters.action && entry.action !== filters.action) return false;
      if (filters.startTime && entry.timestamp < filters.startTime) return false;
      if (filters.endTime && entry.timestamp > filters.endTime) return false;
      return true;
    });
  }

  async addAuditEntry(
    orgId: string,
    entry: Omit<AuditEntry, 'id' | 'orgId' | 'timestamp'>,
  ): Promise<AuditEntry> {
    const auditEntry: AuditEntry = {
      id: crypto.randomUUID(),
      orgId,
      actorId: entry.actorId,
      action: entry.action,
      resource: entry.resource,
      timestamp: Date.now(),
      metadata: entry.metadata,
    };
    const entries = this.auditLog.get(orgId) ?? [];
    entries.push(auditEntry);
    this.auditLog.set(orgId, entries);
    return auditEntry;
  }

  async getUsageStats(orgId: string): Promise<{ totalActions: number; uniqueActors: number }> {
    const entries = this.auditLog.get(orgId) ?? [];
    const actors = new Set(entries.map((e) => e.actorId));
    return { totalActions: entries.length, uniqueActors: actors.size };
  }

  async getSecurityOverview(
    orgId: string,
  ): Promise<{ policyCount: number; auditEntries: number; lastActivity: number | null }> {
    const policies = this.policies.get(orgId) ?? [];
    const entries = this.auditLog.get(orgId) ?? [];
    const lastEntry = entries[entries.length - 1];
    const lastActivity = lastEntry ? lastEntry.timestamp : null;
    return { policyCount: policies.length, auditEntries: entries.length, lastActivity };
  }
}
