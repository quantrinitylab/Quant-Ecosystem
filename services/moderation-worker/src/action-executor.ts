// ============================================================================
// Moderation Worker - Action Executor
// Executes moderation actions and writes audit log entries
// ============================================================================

import type { ModerationAction } from '@quant/moderation';

export interface AuditLogWriter {
  write(params: {
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    diff: Record<string, unknown>;
  }): Promise<void>;
}

export interface ActionResult {
  executed: boolean;
  action: ModerationAction;
  auditLogId: string;
  timestamp: number;
}

export interface ActionExecutorDeps {
  auditLogWriter: AuditLogWriter;
}

export interface ExecuteParams {
  action: ModerationAction;
  contentId: string;
  userId: string;
  severity: string;
  reason: string;
  classificationResult: unknown;
}

export class ActionExecutor {
  private readonly auditLogWriter: AuditLogWriter;

  constructor(deps: ActionExecutorDeps) {
    this.auditLogWriter = deps.auditLogWriter;
  }

  async execute(params: ExecuteParams): Promise<ActionResult> {
    const { action, contentId, userId, severity, reason, classificationResult } = params;
    const auditLogId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const timestamp = Date.now();

    await this.auditLogWriter.write({
      actorId: 'system:moderation-worker',
      action: `moderation.${action}`,
      resourceType: 'content',
      resourceId: contentId,
      diff: {
        action,
        userId,
        severity,
        reason,
        classificationResult: classificationResult as Record<string, unknown>,
        timestamp,
      },
    });

    return {
      executed: true,
      action,
      auditLogId,
      timestamp,
    };
  }
}
