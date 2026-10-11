// Permission-denied honesty (F-115 improvement): when PermissionGuard denies
// a step, the engine must record WHY it was skipped (step result + audit
// entry) instead of silently skipping it. Previously the step was marked
// 'skipped' with no result and no audit trace, so callers could not tell a
// permission denial apart from any other skip.

import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionEngine } from '../execution-engine.js';
import { TypedToolRegistry } from '../typed-tool-registry.js';
import { SafetyClassifier } from '../safety-classifier.js';
import { ApprovalQueue } from '../approval-queue.js';
import { AuditTrail } from '../audit-trail.js';
import { UndoEngine } from '../undo-engine.js';
import { CostTracker } from '../cost-tracker.js';
import { PermissionGuard, PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { AgentPlan, ToolExecutionResult } from '../types.js';

describe('ExecutionEngine permission-denied honesty', () => {
  let engine: ExecutionEngine;
  let permissionGuard: PermissionGuard;

  beforeEach(() => {
    const registry = new TypedToolRegistry();
    const classifier = new SafetyClassifier();
    const approvalQueue = new ApprovalQueue();
    const auditTrail = new AuditTrail();
    const undoEngine = new UndoEngine();
    const costTracker = new CostTracker();
    permissionGuard = new PermissionGuard();
    engine = new ExecutionEngine(
      registry,
      classifier,
      approvalQueue,
      auditTrail,
      undoEngine,
      costTracker,
      permissionGuard,
      { autoApprove: true },
    );

    // Low-privilege agent: can only OBSERVE (Tier0), not act at Tier3.
    permissionGuard.setPermission('agent-low', PermissionLevel.OBSERVE);

    registry.registerTool({
      name: 'highAction',
      description: 'High risk action',
      parameters: [],
      requiredTier: AgentActionTier.Tier3_HighRisk,
      category: 'data',
      handler: async (): Promise<ToolExecutionResult> => ({
        success: true,
        data: {},
        undoable: false,
      }),
    });
  });

  function deniedPlan(): AgentPlan {
    return {
      id: 'plan-denied-honest',
      intent: 'Test denied',
      steps: [
        {
          id: 'step-denied-1',
          toolName: 'highAction',
          args: {},
          tier: AgentActionTier.Tier3_HighRisk,
          description: 'Denied',
          requiresApproval: false,
          status: 'pending',
        },
      ],
      estimatedCost: { totalEstimatedCost: 0, breakdown: [], currency: 'USD' },
      createdAt: Date.now(),
      status: 'draft',
    };
  }

  it('records a reason on the step result when permission is denied', async () => {
    const plan = deniedPlan();
    const result = await engine.executePlan(plan, 'agent-low');

    expect(plan.steps[0]?.status).toBe('skipped');
    const stepResult = plan.steps[0]?.result;
    expect(stepResult).toBeDefined();
    expect(stepResult?.success).toBe(false);
    expect(stepResult?.error).toContain('Permission denied');
    expect(stepResult?.error).toContain('agent-low');
    expect(stepResult?.error).toContain('highAction');
    // Skipped steps still count the plan as success (existing contract).
    expect(result.success).toBe(true);
  });

  it('adds a permission-denied entry to the audit trail', async () => {
    const plan = deniedPlan();
    const result = await engine.executePlan(plan, 'agent-low');

    const denial = result.auditEntries.find((entry) => entry.startsWith('permission-denied:'));
    expect(denial).toBeDefined();
    expect(denial).toContain('step-denied-1');
    expect(denial).toContain('highAction');
    expect(denial).toContain('agent-low');
  });

  it('denied steps are not recorded as actions taken', async () => {
    const plan = deniedPlan();
    const result = await engine.executePlan(plan, 'agent-low');

    expect(result.actionsTaken).toHaveLength(0);
  });

  it('an agent with no registered permission is denied (not granted) and the denial is recorded', async () => {
    const plan = deniedPlan();
    const result = await engine.executePlan(plan, 'unknown-agent');

    expect(plan.steps[0]?.status).toBe('skipped');
    expect(plan.steps[0]?.result?.error).toContain('Permission denied');
    expect(plan.steps[0]?.result?.error).toContain('unknown-agent');
    expect(
      result.auditEntries.some((entry) => entry.startsWith('permission-denied:')),
    ).toBe(true);
  });

  it('granted steps execute normally with no denial entry', async () => {
    permissionGuard.setPermission('agent-full', PermissionLevel.FULL_AUTO);
    const plan: AgentPlan = {
      ...deniedPlan(),
      steps: [
        {
          id: 'step-ok-1',
          toolName: 'highAction',
          args: {},
          tier: AgentActionTier.Tier3_HighRisk,
          description: 'Allowed',
          requiresApproval: false,
          status: 'pending',
        },
      ],
    };
    const result = await engine.executePlan(plan, 'agent-full');

    expect(plan.steps[0]?.status).toBe('completed');
    expect(
      result.auditEntries.some((entry) => entry.startsWith('permission-denied:')),
    ).toBe(false);
  });
});
