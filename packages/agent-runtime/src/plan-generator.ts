import type { AgentPlan, CostEstimate, PlanStep } from './types.js';
import { AgentActionTier } from './types.js';
import type { TypedToolRegistry } from './typed-tool-registry.js';

const TIER_COST: Record<number, number> = {
  [AgentActionTier.Tier0_ReadOnly]: 0,
  [AgentActionTier.Tier1_DraftOnly]: 0.01,
  [AgentActionTier.Tier2_LowRisk]: 0.05,
  [AgentActionTier.Tier3_HighRisk]: 0.1,
  [AgentActionTier.Tier4_Admin]: 0.5,
};

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class PlanGenerator {
  constructor(private toolRegistry: TypedToolRegistry) {}

  generatePlan(intent: string, availableTools: string[]): AgentPlan {
    const steps: PlanStep[] = [];

    for (const toolName of availableTools) {
      const tool = this.toolRegistry.getTool(toolName);
      if (!tool) continue;

      const intentLower = intent.toLowerCase();
      const toolLower = tool.name.toLowerCase();
      const categoryLower = tool.category.toLowerCase();

      // Match tools whose name or category words overlap with the intent
      const isRelevant =
        intentLower.includes(toolLower) ||
        intentLower.includes(categoryLower) ||
        toolLower.split(/[-_]/).some((word) => word.length > 2 && intentLower.includes(word)) ||
        categoryLower.split(/[-_]/).some((word) => word.length > 2 && intentLower.includes(word));

      if (isRelevant) {
        steps.push({
          id: generateId('step'),
          toolName: tool.name,
          args: {},
          tier: tool.requiredTier,
          description: tool.description,
          requiresApproval: tool.requiredTier >= AgentActionTier.Tier2_LowRisk,
          status: 'pending',
        });
      }
    }

    // Fallback: if no tools matched via relevance, include all available tools so the plan
    // is not empty. This handles cases where the intent does not contain tool/category keywords.
    if (steps.length === 0) {
      for (const toolName of availableTools) {
        const tool = this.toolRegistry.getTool(toolName);
        if (!tool) continue;

        steps.push({
          id: generateId('step'),
          toolName: tool.name,
          args: {},
          tier: tool.requiredTier,
          description: tool.description,
          requiresApproval: tool.requiredTier >= AgentActionTier.Tier2_LowRisk,
          status: 'pending',
        });
      }
    }

    const plan: AgentPlan = {
      id: generateId('plan'),
      intent,
      steps,
      estimatedCost: { totalEstimatedCost: 0, breakdown: [], currency: 'USD' },
      createdAt: Date.now(),
      status: 'draft',
    };

    plan.estimatedCost = this.estimateCost(plan);
    return plan;
  }

  estimateCost(plan: AgentPlan): CostEstimate {
    const breakdown: { step: string; cost: number }[] = [];
    let total = 0;

    for (const step of plan.steps) {
      const cost = TIER_COST[step.tier] ?? 0;
      breakdown.push({ step: step.id, cost });
      total += cost;
    }

    return {
      totalEstimatedCost: total,
      breakdown,
      currency: 'USD',
    };
  }

  editStep(plan: AgentPlan, stepId: string, updates: Partial<PlanStep>): AgentPlan {
    return {
      ...plan,
      steps: plan.steps.map((step) => (step.id === stepId ? { ...step, ...updates } : step)),
    };
  }

  removeStep(plan: AgentPlan, stepId: string): AgentPlan {
    const newPlan = {
      ...plan,
      steps: plan.steps.filter((step) => step.id !== stepId),
    };
    newPlan.estimatedCost = this.estimateCost(newPlan);
    return newPlan;
  }
}
