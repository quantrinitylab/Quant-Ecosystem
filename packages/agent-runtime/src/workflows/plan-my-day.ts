import { AgentActionTier } from '../types.js';
import type { AgentPlan, ToolDefinition, ToolExecutionResult } from '../types.js';
import { BaseWorkflow } from './base-workflow.js';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class PlanMyDayWorkflow extends BaseWorkflow {
  get name(): string {
    return 'plan-my-day';
  }

  get description(): string {
    return 'Reads calendar, email, and tasks to produce a daily plan summary';
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'readCalendar',
        description: 'Read calendar events for today',
        parameters: [],
        requiredTier: AgentActionTier.Tier0_ReadOnly,
        category: 'calendar',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { events: [] },
          undoable: false,
        }),
      },
      {
        name: 'readEmails',
        description: 'Read recent emails',
        parameters: [],
        requiredTier: AgentActionTier.Tier0_ReadOnly,
        category: 'email',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { emails: [] },
          undoable: false,
        }),
      },
      {
        name: 'readTasks',
        description: 'Read pending tasks',
        parameters: [],
        requiredTier: AgentActionTier.Tier0_ReadOnly,
        category: 'tasks',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { tasks: [] },
          undoable: false,
        }),
      },
      {
        name: 'summarizeDay',
        description: 'Generate a daily plan summary',
        parameters: [],
        requiredTier: AgentActionTier.Tier0_ReadOnly,
        category: 'planning',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { summary: 'Daily plan generated' },
          undoable: false,
        }),
      },
    ];
  }

  buildPlan(input: Record<string, unknown>): AgentPlan {
    const tools = this.getTools();
    return {
      id: generateId('plan'),
      intent: (input['intent'] as string) ?? 'Plan my day',
      steps: tools.map((tool) => ({
        id: generateId('step'),
        toolName: tool.name,
        args: {},
        tier: tool.requiredTier,
        description: tool.description,
        requiresApproval: false,
        status: 'pending' as const,
      })),
      estimatedCost: { totalEstimatedCost: 0, breakdown: [], currency: 'USD' },
      createdAt: Date.now(),
      status: 'draft',
    };
  }
}
