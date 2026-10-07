import type { AuditLogger } from './audit-logger';
import { AuditAction } from './types';

interface ScheduledDeletion {
  userId: string;
  scheduledAt: Date;
  executeAt: Date;
}

export class DataDeletion {
  private auditLogger: AuditLogger;
  private pendingDeletions: ScheduledDeletion[] = [];

  constructor({ auditLogger }: { auditLogger: AuditLogger }) {
    this.auditLogger = auditLogger;
  }

  deleteUserData(
    userId: string,
    requestedBy: string,
  ): { deletedRecords: number; tables: string[] } {
    const deletedRecords = this.auditLogger._removeWhere((e) => e.userId === userId);

    // Log the deletion event itself
    this.auditLogger.log({
      userId: requestedBy,
      action: AuditAction.DATA_DELETE,
      resource: 'user_data',
      resourceId: userId,
      metadata: { deletedRecords, reason: 'GDPR deletion request' },
    });

    return {
      deletedRecords,
      tables: ['audit_logs'],
    };
  }

  scheduleDataDeletion(
    userId: string,
    executeAfterDays: number,
  ): { scheduledAt: Date; executeAt: Date } {
    const scheduledAt = new Date();
    const executeAt = new Date(scheduledAt.getTime() + executeAfterDays * 24 * 60 * 60 * 1000);

    this.pendingDeletions.push({ userId, scheduledAt, executeAt });

    return { scheduledAt, executeAt };
  }

  getPendingDeletions(): Array<{ userId: string; executeAt: Date }> {
    return this.pendingDeletions.map((d) => ({
      userId: d.userId,
      executeAt: d.executeAt,
    }));
  }
}
