// ============================================================================
// QuantAds - AI Tool Definitions
// ============================================================================

import type { AITool, AIToolResult, AssistantContext } from '../types';

export function getQuantadsTools(): AITool[] {
  return [
    {
      name: 'createCampaign',
      description: 'Create a new advertising campaign',
      parameters: {
        name: { type: 'string', description: 'Campaign name', required: true },
        budget: { type: 'string', description: 'Daily budget in USD', required: true },
        targetAudience: {
          type: 'string',
          description: 'Target audience description',
          required: false,
        },
      },
      handler: async (
        args: Record<string, unknown>,
        _context: AssistantContext,
      ): Promise<AIToolResult> => {
        globalThis.console.log('[quantads] createCampaign:', args);
        return {
          success: true,
          data: { campaignId: `camp_${Date.now()}`, name: args['name'], budget: args['budget'] },
          displayMessage: `Campaign "${args['name']}" created with budget $${args['budget']}/day.`,
        };
      },
    },
    {
      name: 'getAnalytics',
      description: 'Get analytics and performance data for campaigns',
      parameters: {
        campaignId: {
          type: 'string',
          description: 'Campaign ID (optional, all campaigns if omitted)',
          required: false,
        },
        period: {
          type: 'string',
          description: 'Time period',
          required: false,
          enum: ['today', '7d', '30d', '90d'],
        },
      },
      handler: async (
        args: Record<string, unknown>,
        _context: AssistantContext,
      ): Promise<AIToolResult> => {
        globalThis.console.log('[quantads] getAnalytics:', args);
        return {
          success: true,
          data: { impressions: 0, clicks: 0, conversions: 0, spend: 0 },
          displayMessage: 'Analytics data retrieved successfully.',
        };
      },
    },
  ];
}
