import { describe, it, expect } from 'vitest';
import { PlanGenerator } from '../plan-generator.js';
import { TypedToolRegistry } from '../typed-tool-registry.js';
import { AgentActionTier } from '../types.js';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

function createTool(name: string, tier: AgentActionTier): ToolDefinition {
  return {
    name,
    description: `Tool: ${name}`,
    parameters: [],
    requiredTier: tier,
    category: 'general',
    handler: async (): Promise<ToolExecutionResult> => ({ success: true, undoable: false }),
  };
}

describe('PlanGenerator', () => {
  let registry: TypedToolRegistry;
  let generator: PlanGenerator;

  function setup(): void {
    registry = new TypedToolRegistry();
    registry.registerTool(createTool('readData', AgentActionTier.Tier0_ReadOnly));
    registry.registerTool(createTool('draftEmail', AgentActionTier.Tier1_DraftOnly));
    registry.registerTool(createTool('createTask', AgentActionTier.Tier2_LowRisk));
    registry.registerTool(createTool('deleteAccount', AgentActionTier.Tier4_Admin));
    generator = new PlanGenerator(registry);
  }

  describe('generatePlan', () => {
    it('creates plan steps from available tools', () => {
      setup();
      const plan = generator.generatePlan('Read and draft', ['readData', 'draftEmail']);
      expect(plan.steps).toHaveLength(2);
      expect(plan.id).toContain('plan-');
      expect(plan.status).toBe('draft');
    });

    it('sets requiresApproval for Tier2+ steps', () => {
      setup();
      const plan = generator.generatePlan('Create tasks', [
        'readData',
        'createTask',
        'deleteAccount',
      ]);
      const readStep = plan.steps.find((s) => s.toolName === 'readData');
      const createStep = plan.steps.find((s) => s.toolName === 'createTask');
      const deleteStep = plan.steps.find((s) => s.toolName === 'deleteAccount');

      expect(readStep?.requiresApproval).toBe(false);
      expect(createStep?.requiresApproval).toBe(true);
      expect(deleteStep?.requiresApproval).toBe(true);
    });

    it('skips tools not found in registry', () => {
      setup();
      const plan = generator.generatePlan('Test', ['readData', 'nonexistentTool']);
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?.toolName).toBe('readData');
    });
  });

  describe('estimateCost', () => {
    it('returns correct cost breakdown', () => {
      setup();
      const plan = generator.generatePlan('Test', [
        'readData',
        'draftEmail',
        'createTask',
        'deleteAccount',
      ]);
      const cost = generator.estimateCost(plan);

      expect(cost.currency).toBe('USD');
      expect(cost.breakdown).toHaveLength(4);
      // Tier0=0, Tier1=0.01, Tier2=0.05, Tier4=0.50
      expect(cost.totalEstimatedCost).toBeCloseTo(0.56, 2);
    });

    it('returns zero for read-only plans', () => {
      setup();
      const plan = generator.generatePlan('Test', ['readData']);
      const cost = generator.estimateCost(plan);
      expect(cost.totalEstimatedCost).toBe(0);
    });
  });

  describe('editStep', () => {
    it('modifies a step in the plan', () => {
      setup();
      const plan = generator.generatePlan('Test', ['readData', 'draftEmail']);
      const stepId = plan.steps[0]?.id ?? '';
      const edited = generator.editStep(plan, stepId, { description: 'Updated description' });

      const editedStep = edited.steps.find((s) => s.id === stepId);
      expect(editedStep?.description).toBe('Updated description');
    });

    it('does not modify the original plan', () => {
      setup();
      const plan = generator.generatePlan('Test', ['readData']);
      const stepId = plan.steps[0]?.id ?? '';
      generator.editStep(plan, stepId, { description: 'Changed' });
      expect(plan.steps[0]?.description).not.toBe('Changed');
    });
  });

  describe('removeStep', () => {
    it('removes a step from the plan', () => {
      setup();
      const plan = generator.generatePlan('Test', ['readData', 'draftEmail']);
      const stepId = plan.steps[0]?.id ?? '';
      const updated = generator.removeStep(plan, stepId);

      expect(updated.steps).toHaveLength(1);
      expect(updated.steps[0]?.toolName).toBe('draftEmail');
    });

    it('recalculates cost after removal', () => {
      setup();
      const plan = generator.generatePlan('Test', ['readData', 'draftEmail']);
      const draftStepId = plan.steps.find((s) => s.toolName === 'draftEmail')?.id ?? '';
      const updated = generator.removeStep(plan, draftStepId);

      expect(updated.estimatedCost.totalEstimatedCost).toBe(0);
    });
  });
});
