import { AgentActionTier } from '../types.js';
import type { AgentPlan, ToolDefinition, ToolExecutionResult } from '../types.js';
import { BaseWorkflow } from './base-workflow.js';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class EmailReplyWorkflow extends BaseWorkflow {
  get name(): string {
    return 'email-reply';
  }

  get description(): string {
    return 'Drafts replies to emails in user writing style';
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'readEmails',
        description: 'Read emails requiring replies',
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
        name: 'analyzeStyle',
        description: 'Analyze user writing style from past emails',
        parameters: [],
        requiredTier: AgentActionTier.Tier0_ReadOnly,
        category: 'email',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { style: 'professional' },
          undoable: false,
        }),
      },
      {
        name: 'draftReply',
        description: 'Draft a reply in user style',
        parameters: [
          { name: 'emailId', type: 'string', description: 'Email to reply to', required: true },
        ],
        requiredTier: AgentActionTier.Tier1_DraftOnly,
        category: 'email',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { draft: 'Draft reply content' },
          undoable: true,
          undoFn: async () => {
            /* delete draft */
          },
        }),
      },
      {
        name: 'saveDraft',
        description: 'Save email draft',
        parameters: [
          { name: 'content', type: 'string', description: 'Draft content', required: true },
        ],
        requiredTier: AgentActionTier.Tier1_DraftOnly,
        category: 'email',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { saved: true },
          undoable: true,
          undoFn: async () => {
            /* remove draft */
          },
        }),
      },
    ];
  }

  buildPlan(input: Record<string, unknown>): AgentPlan {
    const tools = this.getTools();
    return {
      id: generateId('plan'),
      intent: (input['intent'] as string) ?? 'Draft email replies',
      steps: tools.map((tool) => ({
        id: generateId('step'),
        toolName: tool.name,
        args: {},
        tier: tool.requiredTier,
        description: tool.description,
        requiresApproval: false,
        status: 'pending' as const,
      })),
      estimatedCost: { totalEstimatedCost: 0.02, breakdown: [], currency: 'USD' },
      createdAt: Date.now(),
      status: 'draft',
    };
  }
}
