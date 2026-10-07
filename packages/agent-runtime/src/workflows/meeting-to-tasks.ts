import { AgentActionTier } from '../types.js';
import type { AgentPlan, ToolDefinition, ToolExecutionResult } from '../types.js';
import { BaseWorkflow } from './base-workflow.js';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class MeetingToTasksWorkflow extends BaseWorkflow {
  get name(): string {
    return 'meeting-to-tasks';
  }

  get description(): string {
    return 'Converts meeting notes to tasks and documentation with user confirmation';
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'readMeetingNotes',
        description: 'Read meeting notes or transcript',
        parameters: [
          { name: 'meetingId', type: 'string', description: 'Meeting ID', required: true },
        ],
        requiredTier: AgentActionTier.Tier0_ReadOnly,
        category: 'meetings',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { notes: 'Meeting notes content' },
          undoable: false,
        }),
      },
      {
        name: 'extractActionItems',
        description: 'Extract action items from meeting notes',
        parameters: [],
        requiredTier: AgentActionTier.Tier0_ReadOnly,
        category: 'meetings',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { items: [] },
          undoable: false,
        }),
      },
      {
        name: 'createTasks',
        description: 'Create tasks from extracted action items',
        parameters: [{ name: 'items', type: 'array', description: 'Action items', required: true }],
        requiredTier: AgentActionTier.Tier2_LowRisk,
        category: 'tasks',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { created: 3 },
          undoable: true,
          undoFn: async () => {
            /* delete created tasks */
          },
        }),
      },
      {
        name: 'createDocument',
        description: 'Create summary document from meeting',
        parameters: [
          { name: 'title', type: 'string', description: 'Document title', required: true },
        ],
        requiredTier: AgentActionTier.Tier2_LowRisk,
        category: 'documents',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { docId: 'doc-123' },
          undoable: true,
          undoFn: async () => {
            /* delete document */
          },
        }),
      },
    ];
  }

  buildPlan(input: Record<string, unknown>): AgentPlan {
    const tools = this.getTools();
    return {
      id: generateId('plan'),
      intent: (input['intent'] as string) ?? 'Convert meeting notes to tasks',
      steps: tools.map((tool) => ({
        id: generateId('step'),
        toolName: tool.name,
        args: {},
        tier: tool.requiredTier,
        description: tool.description,
        requiresApproval: tool.requiredTier >= AgentActionTier.Tier2_LowRisk,
        status: 'pending' as const,
      })),
      estimatedCost: { totalEstimatedCost: 0.1, breakdown: [], currency: 'USD' },
      createdAt: Date.now(),
      status: 'draft',
    };
  }
}
