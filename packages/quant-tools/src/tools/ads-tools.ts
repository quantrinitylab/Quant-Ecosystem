import type { ToolDefinition } from '../types.js';

export const adsTools: ToolDefinition[] = [
  {
    id: 'quantads.create-campaign',
    appId: 'quantads',
    name: 'Create Campaign',
    description: 'Create a new advertising campaign',
    inputSchema: {
      name: { type: 'string', required: true, description: 'Campaign name' },
      objective: {
        type: 'string',
        required: true,
        description: 'Campaign objective (awareness, traffic, conversions)',
      },
      startDate: { type: 'string', required: true, description: 'Start date in ISO 8601' },
      endDate: { type: 'string', required: true, description: 'End date in ISO 8601' },
    },
    outputSchema: {
      type: 'object',
      description: 'Campaign creation result',
      fields: {
        campaignId: { type: 'string', description: 'Campaign ID' },
        status: { type: 'string', description: 'Campaign status' },
      },
    },
    permissionTier: 2,
    costEstimate: 'medium',
    undoRecipe: null,
    tags: ['ads', 'campaign', 'marketing'],
  },
  {
    id: 'quantads.set-budget',
    appId: 'quantads',
    name: 'Set Budget',
    description: 'Set or update the budget for an ad campaign',
    inputSchema: {
      campaignId: { type: 'string', required: true, description: 'Campaign ID' },
      dailyBudget: { type: 'number', required: true, description: 'Daily budget in cents' },
      totalBudget: {
        type: 'number',
        required: false,
        description: 'Total campaign budget in cents',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Budget update result',
      fields: {
        success: { type: 'boolean', description: 'Whether budget was set' },
        currentSpend: { type: 'number', description: 'Current spend to date' },
      },
    },
    permissionTier: 3,
    costEstimate: 'high',
    undoRecipe: null,
    tags: ['ads', 'budget', 'spend'],
  },
  {
    id: 'quantads.target-audience',
    appId: 'quantads',
    name: 'Target Audience',
    description: 'Define targeting criteria for an ad campaign',
    inputSchema: {
      campaignId: { type: 'string', required: true, description: 'Campaign ID' },
      demographics: {
        type: 'object',
        required: true,
        description: 'Demographic targeting (age, gender, location)',
      },
      interests: {
        type: 'array',
        required: false,
        description: 'Interest categories',
        default: [],
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Targeting result',
      fields: {
        estimatedReach: { type: 'number', description: 'Estimated audience size' },
        success: { type: 'boolean', description: 'Whether targeting was saved' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['ads', 'targeting', 'audience'],
  },
  {
    id: 'quantads.pause',
    appId: 'quantads',
    name: 'Pause Campaign',
    description: 'Pause an active advertising campaign',
    inputSchema: {
      campaignId: { type: 'string', required: true, description: 'Campaign ID to pause' },
      reason: { type: 'string', required: false, description: 'Reason for pausing' },
    },
    outputSchema: {
      type: 'object',
      description: 'Pause result',
      fields: {
        success: { type: 'boolean', description: 'Whether campaign was paused' },
        pausedAt: { type: 'number', description: 'Pause timestamp' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['ads', 'pause', 'control'],
  },
  {
    id: 'quantads.analytics',
    appId: 'quantads',
    name: 'Campaign Analytics',
    description: 'Get performance analytics for an ad campaign',
    inputSchema: {
      campaignId: { type: 'string', required: true, description: 'Campaign ID' },
      metrics: {
        type: 'array',
        required: false,
        description: 'Metrics to include (impressions, clicks, conversions)',
        default: [],
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Analytics data',
      fields: {
        impressions: { type: 'number', description: 'Total impressions' },
        clicks: { type: 'number', description: 'Total clicks' },
        ctr: { type: 'number', description: 'Click-through rate' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['ads', 'analytics', 'metrics'],
  },
];
