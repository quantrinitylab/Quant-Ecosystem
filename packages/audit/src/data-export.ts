import type { AuditLogger } from './audit-logger';
import type { DataExportResult } from './types';

export class DataExporter {
  private auditLogger: AuditLogger;

  constructor(auditLogger: AuditLogger) {
    this.auditLogger = auditLogger;
  }

  exportUserData(userId: string): DataExportResult {
    const events = this.auditLogger.getByUser(userId);

    return {
      userId,
      exportedAt: new Date(),
      data: {
        auditEvents: events.map((e) => ({ ...e })),
      },
      format: 'json',
    };
  }

  generateExportManifest(userId: string): {
    tables: string[];
    recordCount: number;
    estimatedSize: string;
  } {
    const events = this.auditLogger.getByUser(userId);
    const estimatedBytes = JSON.stringify(events).length;

    return {
      tables: ['audit_logs'],
      recordCount: events.length,
      estimatedSize:
        estimatedBytes > 1024
          ? `${(estimatedBytes / 1024).toFixed(1)} KB`
          : `${estimatedBytes} bytes`,
    };
  }
}
