import { AgentActionTier } from '../types.js';
import type { AgentPlan, ToolDefinition, ToolExecutionResult } from '../types.js';
import { BaseWorkflow } from './base-workflow.js';

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class ContentLaunchWorkflow extends BaseWorkflow {
  get name(): string {
    return 'content-launch';
  }

  get description(): string {
    return 'Creates post, video caption, email, ad campaign, and publishes content with approval';
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'draftPost',
        description: 'Draft a social media post',
        parameters: [{ name: 'topic', type: 'string', description: 'Post topic', required: true }],
        requiredTier: AgentActionTier.Tier1_DraftOnly,
        category: 'content',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { post: 'Draft post content' },
          undoable: true,
          undoFn: async () => {
            /* delete draft */
          },
        }),
      },
      {
        name: 'generateCaption',
        description: 'Generate a video caption',
        parameters: [{ name: 'videoId', type: 'string', description: 'Video ID', required: true }],
        requiredTier: AgentActionTier.Tier1_DraftOnly,
        category: 'content',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { caption: 'Generated caption' },
          undoable: true,
          undoFn: async () => {
            /* remove caption */
          },
        }),
      },
      {
        name: 'composeEmail',
        description: 'Compose announcement email',
        parameters: [
          { name: 'subject', type: 'string', description: 'Email subject', required: true },
        ],
        requiredTier: AgentActionTier.Tier1_DraftOnly,
        category: 'email',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { email: 'Announcement email draft' },
          undoable: true,
          undoFn: async () => {
            /* delete email draft */
          },
        }),
      },
      {
        name: 'createCampaign',
        description: 'Create an ad campaign (requires approval)',
        parameters: [
          { name: 'budget', type: 'number', description: 'Campaign budget', required: true },
        ],
        requiredTier: AgentActionTier.Tier3_HighRisk,
        category: 'advertising',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { campaignId: 'campaign-001' },
          undoable: true,
          undoFn: async () => {
            /* cancel campaign */
          },
        }),
      },
      {
        name: 'publishContent',
        description: 'Publish all content live (requires approval)',
        parameters: [],
        requiredTier: AgentActionTier.Tier3_HighRisk,
        category: 'publishing',
        handler: async (): Promise<ToolExecutionResult> => ({
          success: true,
          data: { published: true },
          undoable: true,
          undoFn: async () => {
            /* unpublish */
          },
        }),
      },
    ];
  }

  buildPlan(input: Record<string, unknown>): AgentPlan {
    const tools = this.getTools();
    return {
      id: generateId('plan'),
      intent: (input['intent'] as string) ?? 'Launch content campaign',
      steps: tools.map((tool) => ({
        id: generateId('step'),
        toolName: tool.name,
        args: {},
        tier: tool.requiredTier,
        description: tool.description,
        requiresApproval: tool.requiredTier >= AgentActionTier.Tier2_LowRisk,
        status: 'pending' as const,
      })),
      estimatedCost: { totalEstimatedCost: 0.23, breakdown: [], currency: 'USD' },
      createdAt: Date.now(),
      status: 'draft',
    };
  }
}
