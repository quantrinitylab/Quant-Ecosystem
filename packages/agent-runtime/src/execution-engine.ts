// NOTE: Identity-permissions integration (RBAC, consent checks, AI access toggles) is not yet
// wired into the execution pipeline. This will be added in a future phase when the cross-package
// integration layer is implemented. See review issue #4.

import type { AgentPlan, AgentWorkflowResult, ToolExecutionResult } from './types.js';
import { AgentActionTier, SafetyLevel } from './types.js';
import { PermissionLevel } from './permissions.js';
import type { PermissionGuard } from './permissions.js';
import type { TypedToolRegistry } from './typed-tool-registry.js';
import type { SafetyClassifier } from './safety-classifier.js';
import type { ApprovalQueue } from './approval-queue.js';
import type { AuditTrail } from './audit-trail.js';
import type { UndoEngine } from './undo-engine.js';
import type { CostTracker } from './cost-tracker.js';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const TIER_COST: Record<number, number> = {
  [AgentActionTier.Tier0_ReadOnly]: 0,
  [AgentActionTier.Tier1_DraftOnly]: 0.01,
  [AgentActionTier.Tier2_LowRisk]: 0.05,
  [AgentActionTier.Tier3_HighRisk]: 0.1,
  [AgentActionTier.Tier4_Admin]: 0.5,
};

export function tierToPermissionLevel(tier: AgentActionTier): PermissionLevel {
  switch (tier) {
    case AgentActionTier.Tier0_ReadOnly:
      return PermissionLevel.OBSERVE;
    case AgentActionTier.Tier1_DraftOnly:
      return PermissionLevel.SUGGEST;
    case AgentActionTier.Tier2_LowRisk:
      return PermissionLevel.ACT_LOW;
    case AgentActionTier.Tier3_HighRisk:
      return PermissionLevel.ACT_HIGH;
    case AgentActionTier.Tier4_Admin:
      return PermissionLevel.FULL_AUTO;
  }
}

export interface ExecutionEngineOptions {
  /** When true, approval requests are auto-approved immediately. Default: true.
   * Set to false when async approval flows (human-in-the-loop, external webhook) are wired in. */
  autoApprove?: boolean;
}

export class ExecutionEngine {
  private readonly autoApprove: boolean;

  constructor(
    private toolRegistry: TypedToolRegistry,
    private safetyClassifier: SafetyClassifier,
    private approvalQueue: ApprovalQueue,
    private auditTrail: AuditTrail,
    private undoEngine: UndoEngine,
    private costTracker: CostTracker,
    private permissionGuard: PermissionGuard,
    options?: ExecutionEngineOptions,
  ) {
    this.autoApprove = options?.autoApprove ?? true;
  }

  async executePlan(plan: AgentPlan, agentId: string): Promise<AgentWorkflowResult> {
    const actionsTaken: { step: string; result: ToolExecutionResult }[] = [];
    const undoableActions: string[] = [];
    const auditEntries: string[] = [];
    let totalCost = 0;

    plan.status = 'executing';

    for (const step of plan.steps) {
      // 1. Check permission
      const requiredPermission = tierToPermissionLevel(step.tier);
      const hasPermission = this.permissionGuard.validate({
        action: step.toolName,
        requiredPermission,
        agentId,
      });

      if (!hasPermission) {
        step.status = 'skipped';
        continue;
      }

      // 2. Safety check
      // Context enrichment (injecting piiAccess, consent, amount, affectedCount from
      // identity-permissions) will be added when cross-package integration is wired in.
      const safety = this.safetyClassifier.classify(step.toolName, step.args);
      if (safety.level === SafetyLevel.Blocked) {
        step.status = 'failed';
        const failResult: ToolExecutionResult = {
          success: false,
          error: `Blocked by safety classifier: ${safety.reason}`,
          undoable: false,
        };
        step.result = failResult;
        actionsTaken.push({ step: step.id, result: failResult });
        continue;
      }

      // 3. Submit to approval queue if required.
      // Foundation phase: auto-approve is enabled by default because async approval requires
      // external integrations (webhooks, human-in-the-loop UI) not yet built. In production,
      // set autoApprove=false so the engine yields here and awaits external approval/rejection.
      if (step.requiresApproval) {
        const approvalId = generateId('approval');
        this.approvalQueue.submit({
          id: approvalId,
          agentId,
          action: step.toolName,
          riskLevel: step.tier >= AgentActionTier.Tier3_HighRisk ? 'high' : 'medium',
          metadata: { stepId: step.id, planId: plan.id },
        });

        if (this.autoApprove) {
          this.approvalQueue.approve(approvalId);
          step.status = 'approved';
        } else {
          // When autoApprove is disabled, skip execution of this step.
          // A future implementation will suspend and resume on external callback.
          step.status = 'skipped';
          continue;
        }
      }

      // 4. Execute
      step.status = 'executing';
      const tool = this.toolRegistry.getTool(step.toolName);
      if (!tool) {
        step.status = 'failed';
        const notFoundResult: ToolExecutionResult = {
          success: false,
          error: `Tool '${step.toolName}' not found in registry`,
          undoable: false,
        };
        step.result = notFoundResult;
        actionsTaken.push({ step: step.id, result: notFoundResult });
        continue;
      }

      let result: ToolExecutionResult;
      try {
        result = await tool.handler(step.args);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        result = { success: false, error: errorMsg, undoable: false };
      }

      step.result = result;
      step.status = result.success ? 'completed' : 'failed';
      actionsTaken.push({ step: step.id, result });

      // 5. Log to audit trail
      const auditId = generateId('audit');
      this.auditTrail.log({
        id: auditId,
        agentId,
        action: step.toolName,
        timestamp: Date.now(),
        result: result.success ? 'success' : 'failure',
        reversible: result.undoable,
        metadata: { planId: plan.id, stepId: step.id },
      });
      auditEntries.push(auditId);

      // 6. Register undo if available
      if (result.undoable && result.undoFn) {
        this.undoEngine.registerAction(step.id, result.undoFn);
        undoableActions.push(step.id);
      }

      // 7. Track cost
      const stepCost = TIER_COST[step.tier] ?? 0;
      if (stepCost > 0) {
        this.costTracker.recordCost(agentId, plan.id, stepCost, `Step: ${step.toolName}`);
      }
      totalCost += stepCost;
    }

    const allCompleted = plan.steps.every(
      (s) => s.status === 'completed' || s.status === 'skipped',
    );
    plan.status = allCompleted ? 'completed' : 'failed';

    return {
      success: allCompleted,
      planId: plan.id,
      actionsTaken,
      undoableActions,
      auditEntries,
      totalCost,
    };
  }
}
