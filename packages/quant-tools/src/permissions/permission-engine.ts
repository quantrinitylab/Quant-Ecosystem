import type { PermissionTier, ToolDefinition, ToolPlan } from '../types.js';

export class PermissionEngine {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(tools: ToolDefinition[] = []) {
    for (const tool of tools) {
      this.tools.set(tool.id, tool);
    }
  }

  evaluate(
    toolId: string,
    userTier: PermissionTier,
  ): { allowed: boolean; reason: string; confirmationRequired: boolean } {
    const tool = this.tools.get(toolId);
    if (!tool) {
      return {
        allowed: false,
        reason: `Tool '${toolId}' not found`,
        confirmationRequired: false,
      };
    }

    const toolTier = tool.permissionTier;

    if (userTier < toolTier) {
      return {
        allowed: false,
        reason: `Insufficient permissions: requires tier ${toolTier}, user has tier ${userTier}`,
        confirmationRequired: false,
      };
    }

    const confirmationRequired = toolTier >= 2;

    return {
      allowed: true,
      reason: confirmationRequired
        ? `Allowed with confirmation (tier ${toolTier})`
        : `Allowed (tier ${toolTier})`,
      confirmationRequired,
    };
  }

  costPreview(plan: ToolPlan): {
    totalCost: string;
    breakdown: { toolId: string; cost: string }[];
  } {
    const costLevels: Record<string, number> = { free: 0, low: 1, medium: 2, high: 3 };
    const labels = ['free', 'low', 'medium', 'high'];
    const breakdown: { toolId: string; cost: string }[] = [];
    let maxCostLevel = 0;

    for (const step of plan.steps) {
      const tool = this.tools.get(step.toolId);
      const cost = tool?.costEstimate ?? 'free';
      breakdown.push({ toolId: step.toolId, cost });
      const level = costLevels[cost] ?? 0;
      if (level > maxCostLevel) {
        maxCostLevel = level;
      }
    }

    return {
      totalCost: labels[maxCostLevel] ?? 'free',
      breakdown,
    };
  }
}
