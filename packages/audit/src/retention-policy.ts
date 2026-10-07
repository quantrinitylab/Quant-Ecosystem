import type { AuditLogger } from './audit-logger';
import type { RetentionPolicy } from './types';

export class RetentionManager {
  private policies: RetentionPolicy[] = [];

  addPolicy(policy: RetentionPolicy): void {
    const existing = this.policies.findIndex((p) => p.resource === policy.resource);
    if (existing >= 0) {
      this.policies[existing] = policy;
    } else {
      this.policies.push(policy);
    }
  }

  removePolicy(resource: string): void {
    this.policies = this.policies.filter((p) => p.resource !== resource);
  }

  getPolicies(): RetentionPolicy[] {
    return [...this.policies];
  }

  applyRetention(auditLogger: AuditLogger): { deletedCount: number; resources: string[] } {
    let totalDeleted = 0;
    const affectedResources: string[] = [];

    for (const policy of this.policies) {
      if (!policy.enabled) continue;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.maxAgeDays);

      const deleted = auditLogger._removeWhere(
        (event) => event.resource === policy.resource && event.timestamp < cutoffDate,
      );

      if (deleted > 0) {
        totalDeleted += deleted;
        affectedResources.push(policy.resource);
      }
    }

    return { deletedCount: totalDeleted, resources: affectedResources };
  }

  getRetentionStatus(
    auditLogger: AuditLogger,
  ): Array<{ resource: string; oldestRecord: Date | null; totalRecords: number }> {
    return this.policies.map((policy) => {
      const events = auditLogger.getByResource(policy.resource);
      const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return {
        resource: policy.resource,
        oldestRecord: sorted.length > 0 ? sorted[0]!.timestamp : null,
        totalRecords: events.length,
      };
    });
  }
}
