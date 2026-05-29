import type { ToolDefinition } from '../types.js';

export const maxTools: ToolDefinition[] = [
  {
    id: 'quantmax.start-session',
    appId: 'quantmax',
    name: 'Start AI Session',
    description: 'Start a new QuantMax AI session for generation or analysis',
    inputSchema: {
      model: {
        type: 'string',
        required: false,
        description: 'Model to use',
        default: 'quantmax-default',
      },
      systemPrompt: {
        type: 'string',
        required: false,
        description: 'System prompt for the session',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Session start result',
      fields: {
        sessionId: { type: 'string', description: 'AI session ID' },
        model: { type: 'string', description: 'Active model name' },
      },
    },
    permissionTier: 0,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['ai', 'session', 'start'],
  },
  {
    id: 'quantmax.end-session',
    appId: 'quantmax',
    name: 'End AI Session',
    description: 'End an active QuantMax AI session',
    inputSchema: {
      sessionId: { type: 'string', required: true, description: 'Session ID to end' },
    },
    outputSchema: {
      type: 'object',
      description: 'Session end result',
      fields: {
        success: { type: 'boolean', description: 'Whether session ended' },
        tokensUsed: { type: 'number', description: 'Total tokens consumed' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['ai', 'session', 'end'],
  },
  {
    id: 'quantmax.generate',
    appId: 'quantmax',
    name: 'Generate Content',
    description: 'Generate text, code, or creative content using AI',
    inputSchema: {
      prompt: { type: 'string', required: true, description: 'Generation prompt' },
      maxTokens: {
        type: 'number',
        required: false,
        description: 'Maximum tokens to generate',
        default: 2048,
      },
      temperature: {
        type: 'number',
        required: false,
        description: 'Sampling temperature',
        default: 0.7,
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Generation result',
      fields: {
        content: { type: 'string', description: 'Generated content' },
        tokensUsed: { type: 'number', description: 'Tokens consumed' },
      },
    },
    permissionTier: 1,
    costEstimate: 'medium',
    undoRecipe: null,
    tags: ['ai', 'generate', 'content'],
  },
  {
    id: 'quantmax.analyze',
    appId: 'quantmax',
    name: 'Analyze Content',
    description: 'Analyze text, data, or documents using AI',
    inputSchema: {
      content: { type: 'string', required: true, description: 'Content to analyze' },
      analysisType: {
        type: 'string',
        required: true,
        description: 'Type of analysis (sentiment, summary, classify, extract)',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Analysis result',
      fields: {
        result: { type: 'string', description: 'Analysis output' },
        confidence: { type: 'number', description: 'Confidence score' },
      },
    },
    permissionTier: 0,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['ai', 'analyze', 'nlp'],
  },
  {
    id: 'quantmax.explain',
    appId: 'quantmax',
    name: 'Explain Topic',
    description: 'Get an AI explanation of a topic or concept',
    inputSchema: {
      topic: { type: 'string', required: true, description: 'Topic to explain' },
      depth: {
        type: 'string',
        required: false,
        description: 'Depth level (brief, standard, detailed)',
        default: 'standard',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Explanation result',
      fields: {
        explanation: { type: 'string', description: 'Explanation text' },
        relatedTopics: { type: 'array', description: 'Related topics for further exploration' },
      },
    },
    permissionTier: 0,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['ai', 'explain', 'learn'],
  },
];
