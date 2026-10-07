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
import { PlanMyDayWorkflow } from '../workflows/plan-my-day.js';
import { EmailReplyWorkflow } from '../workflows/email-reply.js';
import { MeetingToTasksWorkflow } from '../workflows/meeting-to-tasks.js';
import { CrossAppSearchWorkflow } from '../workflows/cross-app-search.js';
import { ContentLaunchWorkflow } from '../workflows/content-launch.js';

function createEngine(): {
  engine: ExecutionEngine;
  registry: TypedToolRegistry;
  auditTrail: AuditTrail;
  undoEngine: UndoEngine;
  costTracker: CostTracker;
  permissionGuard: PermissionGuard;
} {
  const registry = new TypedToolRegistry();
  const classifier = new SafetyClassifier();
  const approvalQueue = new ApprovalQueue();
  const auditTrail = new AuditTrail();
  const undoEngine = new UndoEngine();
  const costTracker = new CostTracker();
  const permissionGuard = new PermissionGuard();

  const engine = new ExecutionEngine(
    registry,
    classifier,
    approvalQueue,
    auditTrail,
    undoEngine,
    costTracker,
    permissionGuard,
  );

  // Grant full permissions to test agent
  permissionGuard.setPermission('test-agent', PermissionLevel.FULL_AUTO);

  return { engine, registry, auditTrail, undoEngine, costTracker, permissionGuard };
}

function registerWorkflowTools(
  registry: TypedToolRegistry,
  workflow: {
    getTools: () => {
      name: string;
      description: string;
      parameters: {
        name: string;
        type: 'string' | 'number' | 'boolean' | 'object' | 'array';
        description: string;
        required: boolean;
        default?: unknown;
      }[];
      requiredTier: AgentActionTier;
      category: string;
      handler: (
        args: Record<string, unknown>,
      ) => Promise<{
        success: boolean;
        data?: unknown;
        error?: string;
        undoable: boolean;
        undoFn?: () => Promise<void>;
      }>;
    }[];
  },
): void {
  for (const tool of workflow.getTools()) {
    if (!registry.hasTool(tool.name)) {
      registry.registerTool(tool);
    }
  }
}

describe('Workflows', () => {
  describe('PlanMyDayWorkflow', () => {
    let engine: ExecutionEngine;
    let registry: TypedToolRegistry;
    let auditTrail: AuditTrail;

    beforeEach(() => {
      const deps = createEngine();
      engine = deps.engine;
      registry = deps.registry;
      auditTrail = deps.auditTrail;
    });

    it('executes all read-only steps without approval', async () => {
      const workflow = new PlanMyDayWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      const result = await workflow.execute({ intent: 'Plan my day' }, 'test-agent');
      expect(result.success).toBe(true);
      expect(result.actionsTaken).toHaveLength(4);
      // All Tier 0 - no approvals needed
      expect(result.totalCost).toBe(0);
    });

    it('creates audit entries for each step', async () => {
      const workflow = new PlanMyDayWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      await workflow.execute({}, 'test-agent');
      expect(workflow.getAuditTrail()).toHaveLength(4);
      expect(auditTrail.getByAgent('test-agent')).toHaveLength(4);
    });

    it('has no undoable actions (all read-only)', async () => {
      const workflow = new PlanMyDayWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      await workflow.execute({}, 'test-agent');
      expect(workflow.getUndoableActions()).toHaveLength(0);
    });
  });

  describe('EmailReplyWorkflow', () => {
    let engine: ExecutionEngine;
    let registry: TypedToolRegistry;

    beforeEach(() => {
      const deps = createEngine();
      engine = deps.engine;
      registry = deps.registry;
    });

    it('creates drafts at Tier 1', async () => {
      const workflow = new EmailReplyWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      const result = await workflow.execute({ intent: 'Draft email replies' }, 'test-agent');
      expect(result.success).toBe(true);
      expect(result.actionsTaken).toHaveLength(4);
    });

    it('has undoable draft actions', async () => {
      const workflow = new EmailReplyWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      await workflow.execute({}, 'test-agent');
      expect(workflow.getUndoableActions().length).toBeGreaterThan(0);
    });

    it('tracks cost for draft steps', async () => {
      const workflow = new EmailReplyWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      await workflow.execute({}, 'test-agent');
      expect(workflow.getCost()).toBeGreaterThan(0);
    });
  });

  describe('MeetingToTasksWorkflow', () => {
    let engine: ExecutionEngine;
    let registry: TypedToolRegistry;

    beforeEach(() => {
      const deps = createEngine();
      engine = deps.engine;
      registry = deps.registry;
    });

    it('marks Tier2 steps for approval', async () => {
      const workflow = new MeetingToTasksWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      const plan = workflow.buildPlan({ intent: 'Convert meeting to tasks' });
      const approvalSteps = plan.steps.filter((s) => s.requiresApproval);
      expect(approvalSteps.length).toBeGreaterThan(0);
      expect(approvalSteps.every((s) => s.tier >= AgentActionTier.Tier2_LowRisk)).toBe(true);
    });

    it('executes full workflow with undoable task creation', async () => {
      const workflow = new MeetingToTasksWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      const result = await workflow.execute({}, 'test-agent');
      expect(result.success).toBe(true);
      expect(result.undoableActions.length).toBeGreaterThan(0);
    });
  });

  describe('CrossAppSearchWorkflow', () => {
    let engine: ExecutionEngine;
    let registry: TypedToolRegistry;

    beforeEach(() => {
      const deps = createEngine();
      engine = deps.engine;
      registry = deps.registry;
    });

    it('all steps are Tier 0 (read-only)', async () => {
      const workflow = new CrossAppSearchWorkflow(engine);
      const plan = workflow.buildPlan({ query: 'test' });
      expect(plan.steps.every((s) => s.tier === AgentActionTier.Tier0_ReadOnly)).toBe(true);
    });

    it('executes all search steps without approval', async () => {
      const workflow = new CrossAppSearchWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      const result = await workflow.execute({ query: 'project updates' }, 'test-agent');
      expect(result.success).toBe(true);
      expect(result.actionsTaken).toHaveLength(5);
      expect(result.totalCost).toBe(0);
    });
  });

  describe('ContentLaunchWorkflow', () => {
    let engine: ExecutionEngine;
    let registry: TypedToolRegistry;

    beforeEach(() => {
      const deps = createEngine();
      engine = deps.engine;
      registry = deps.registry;
    });

    it('has mixed tiers across steps', () => {
      const workflow = new ContentLaunchWorkflow(engine);
      const plan = workflow.buildPlan({});
      const tiers = new Set(plan.steps.map((s) => s.tier));
      expect(tiers.has(AgentActionTier.Tier1_DraftOnly)).toBe(true);
      expect(tiers.has(AgentActionTier.Tier3_HighRisk)).toBe(true);
    });

    it('Tier3 steps require approval', () => {
      const workflow = new ContentLaunchWorkflow(engine);
      const plan = workflow.buildPlan({});
      const tier3Steps = plan.steps.filter((s) => s.tier === AgentActionTier.Tier3_HighRisk);
      expect(tier3Steps.length).toBeGreaterThan(0);
      expect(tier3Steps.every((s) => s.requiresApproval)).toBe(true);
    });

    it('executes full workflow with audit, undo, and cost', async () => {
      const workflow = new ContentLaunchWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      const result = await workflow.execute({ intent: 'Launch campaign' }, 'test-agent');
      expect(result.success).toBe(true);
      expect(workflow.getAuditTrail().length).toBeGreaterThan(0);
      expect(workflow.getUndoableActions().length).toBeGreaterThan(0);
      expect(workflow.getCost()).toBeGreaterThan(0);
    });

    it('stores plan after execution', async () => {
      const workflow = new ContentLaunchWorkflow(engine);
      registerWorkflowTools(registry, workflow);

      await workflow.execute({}, 'test-agent');
      const plan = workflow.getPlan();
      expect(plan).not.toBeNull();
      expect(plan?.status).toBe('completed');
    });
  });
});
