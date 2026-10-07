import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionEngine, tierToPermissionLevel } from '../execution-engine.js';
import { TypedToolRegistry } from '../typed-tool-registry.js';
import { SafetyClassifier } from '../safety-classifier.js';
import { ApprovalQueue } from '../approval-queue.js';
import { AuditTrail } from '../audit-trail.js';
import { UndoEngine } from '../undo-engine.js';
import { CostTracker } from '../cost-tracker.js';
import { PermissionGuard, PermissionLevel } from '../permissions.js';
import { AgentActionTier } from '../types.js';
import type { AgentPlan, ToolExecutionResult } from '../types.js';

describe('ExecutionEngine', () => {
  let registry: TypedToolRegistry;
  let classifier: SafetyClassifier;
  let approvalQueue: ApprovalQueue;
  let auditTrail: AuditTrail;
  let undoEngine: UndoEngine;
  let costTracker: CostTracker;
  let permissionGuard: PermissionGuard;
  let engine: ExecutionEngine;

  beforeEach(() => {
    registry = new TypedToolRegistry();
    classifier = new SafetyClassifier();
    approvalQueue = new ApprovalQueue();
    auditTrail = new AuditTrail();
    undoEngine = new UndoEngine();
    costTracker = new CostTracker();
    permissionGuard = new PermissionGuard();
    engine = new ExecutionEngine(
      registry,
      classifier,
      approvalQueue,
      auditTrail,
      undoEngine,
      costTracker,
      permissionGuard,
    );

    // Register agent with high permissions
    permissionGuard.setPermission('agent-1', PermissionLevel.FULL_AUTO);

    // Register a simple tool
    registry.registerTool({
      name: 'readData',
      description: 'Read data',
      parameters: [],
      requiredTier: AgentActionTier.Tier0_ReadOnly,
      category: 'data',
      handler: async (): Promise<ToolExecutionResult> => ({
        success: true,
        data: { items: [] },
        undoable: false,
      }),
    });
  });

  describe('executePlan - full pipeline', () => {
    it('executes a simple plan successfully', async () => {
      const plan: AgentPlan = {
        id: 'plan-001',
        intent: 'Read data',
        steps: [
          {
            id: 'step-001',
            toolName: 'readData',
            args: {},
            tier: AgentActionTier.Tier0_ReadOnly,
            description: 'Read data',
            requiresApproval: false,
            status: 'pending',
          },
        ],
        estimatedCost: { totalEstimatedCost: 0, breakdown: [], currency: 'USD' },
        createdAt: Date.now(),
        status: 'draft',
      };

      const result = await engine.executePlan(plan, 'agent-1');
      expect(result.success).toBe(true);
      expect(result.planId).toBe('plan-001');
      expect(result.actionsTaken).toHaveLength(1);
      expect(result.actionsTaken[0]?.result.success).toBe(true);
      expect(result.auditEntries).toHaveLength(1);
    });

    it('logs to audit trail', async () => {
      const plan: AgentPlan = {
        id: 'plan-002',
        intent: 'Test audit',
        steps: [
          {
            id: 'step-002',
            toolName: 'readData',
            args: {},
            tier: AgentActionTier.Tier0_ReadOnly,
            description: 'Read',
            requiresApproval: false,
            status: 'pending',
          },
        ],
        estimatedCost: { totalEstimatedCost: 0, breakdown: [], currency: 'USD' },
        createdAt: Date.now(),
        status: 'draft',
      };

      await engine.executePlan(plan, 'agent-1');
      const entries = auditTrail.getByAgent('agent-1');
      expect(entries).toHaveLength(1);
      expect(entries[0]?.action).toBe('readData');
    });

    it('registers undo for undoable actions', async () => {
      const undoFn = vi.fn();
      registry.registerTool({
        name: 'createItem',
        description: 'Create an item',
        parameters: [],
        requiredTier: AgentActionTier.Tier1_DraftOnly,
        category: 'data',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          undoable: true,
          undoFn,
        }),
      });

      const plan: AgentPlan = {
        id: 'plan-003',
        intent: 'Create item',
        steps: [
          {
            id: 'step-undo-1',
            toolName: 'createItem',
            args: {},
            tier: AgentActionTier.Tier1_DraftOnly,
            description: 'Create',
            requiresApproval: false,
            status: 'pending',
          },
        ],
        estimatedCost: { totalEstimatedCost: 0, breakdown: [], currency: 'USD' },
        createdAt: Date.now(),
        status: 'draft',
      };

      const result = await engine.executePlan(plan, 'agent-1');
      expect(result.undoableActions).toContain('step-undo-1');
      expect(undoEngine.canUndo('step-undo-1')).toBe(true);
    });

    it('tracks cost for executed steps', async () => {
      registry.registerTool({
        name: 'highRiskAction',
        description: 'High risk',
        parameters: [],
        requiredTier: AgentActionTier.Tier3_HighRisk,
        category: 'data',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          undoable: false,
        }),
      });

      const plan: AgentPlan = {
        id: 'plan-cost',
        intent: 'Test cost',
        steps: [
          {
            id: 'step-cost-1',
            toolName: 'highRiskAction',
            args: {},
            tier: AgentActionTier.Tier3_HighRisk,
            description: 'Costly action',
            requiresApproval: true,
            status: 'pending',
          },
        ],
        estimatedCost: { totalEstimatedCost: 0.1, breakdown: [], currency: 'USD' },
        createdAt: Date.now(),
        status: 'draft',
      };

      const result = await engine.executePlan(plan, 'agent-1');
      expect(result.totalCost).toBeCloseTo(0.1, 2);
    });
  });

  describe('permission denied', () => {
    it('skips step when agent lacks permission', async () => {
      permissionGuard.setPermission('agent-low', PermissionLevel.OBSERVE);

      registry.registerTool({
        name: 'highAction',
        description: 'High action',
        parameters: [],
        requiredTier: AgentActionTier.Tier3_HighRisk,
        category: 'data',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          undoable: false,
        }),
      });

      const plan: AgentPlan = {
        id: 'plan-denied',
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

      const result = await engine.executePlan(plan, 'agent-low');
      expect(result.success).toBe(true); // skipped steps count as success
      expect(plan.steps[0]?.status).toBe('skipped');
      expect(result.actionsTaken).toHaveLength(0);
    });
  });

  describe('safety blocked', () => {
    it('fails step when safety classifier blocks it', async () => {
      registry.registerTool({
        name: 'override_moderation',
        description: 'Override moderation',
        parameters: [],
        requiredTier: AgentActionTier.Tier0_ReadOnly,
        category: 'moderation',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          undoable: false,
        }),
      });

      const plan: AgentPlan = {
        id: 'plan-blocked',
        intent: 'Test blocked',
        steps: [
          {
            id: 'step-blocked-1',
            toolName: 'override_moderation',
            args: {},
            tier: AgentActionTier.Tier0_ReadOnly,
            description: 'Override',
            requiresApproval: false,
            status: 'pending',
          },
        ],
        estimatedCost: { totalEstimatedCost: 0, breakdown: [], currency: 'USD' },
        createdAt: Date.now(),
        status: 'draft',
      };

      const result = await engine.executePlan(plan, 'agent-1');
      expect(result.success).toBe(false);
      expect(plan.steps[0]?.status).toBe('failed');
      expect(result.actionsTaken[0]?.result.error).toContain('Blocked by safety classifier');
    });
  });

  describe('tierToPermissionLevel', () => {
    it('maps Tier0 to OBSERVE', () => {
      expect(tierToPermissionLevel(AgentActionTier.Tier0_ReadOnly)).toBe(PermissionLevel.OBSERVE);
    });

    it('maps Tier1 to SUGGEST', () => {
      expect(tierToPermissionLevel(AgentActionTier.Tier1_DraftOnly)).toBe(PermissionLevel.SUGGEST);
    });

    it('maps Tier2 to ACT_LOW', () => {
      expect(tierToPermissionLevel(AgentActionTier.Tier2_LowRisk)).toBe(PermissionLevel.ACT_LOW);
    });

    it('maps Tier3 to ACT_HIGH', () => {
      expect(tierToPermissionLevel(AgentActionTier.Tier3_HighRisk)).toBe(PermissionLevel.ACT_HIGH);
    });

    it('maps Tier4 to FULL_AUTO', () => {
      expect(tierToPermissionLevel(AgentActionTier.Tier4_Admin)).toBe(PermissionLevel.FULL_AUTO);
    });
  });
});
