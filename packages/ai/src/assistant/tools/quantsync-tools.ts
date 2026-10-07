// ============================================================================
// QuantSync - AI Tool Definitions
// ============================================================================

import type { AITool, AIToolResult, AssistantContext } from '../types';

export function getQuantsyncTools(): AITool[] {
  return [
    {
      name: 'createPost',
      description: 'Create a new social post on QuantSync',
      parameters: {
        content: { type: 'string', description: 'Post content text', required: true },
        mediaUrl: { type: 'string', description: 'Optional media attachment URL', required: false },
      },
      handler: async (
        args: Record<string, unknown>,
        _context: AssistantContext,
      ): Promise<AIToolResult> => {
        globalThis.console.log('[quantsync] createPost:', args);
        return {
          success: true,
          data: { postId: `post_${Date.now()}`, content: args['content'] },
          displayMessage: `Post created successfully: "${args['content']}"`,
        };
      },
    },
    {
      name: 'searchContent',
      description: 'Search for posts, users, or hashtags on QuantSync',
      parameters: {
        query: { type: 'string', description: 'Search query', required: true },
        type: {
          type: 'string',
          description: 'Content type to search',
          required: false,
          enum: ['posts', 'users', 'hashtags'],
        },
      },
      handler: async (
        args: Record<string, unknown>,
        _context: AssistantContext,
      ): Promise<AIToolResult> => {
        globalThis.console.log('[quantsync] searchContent:', args);
        return {
          success: true,
          data: { results: [], totalCount: 0 },
          displayMessage: `Found content matching "${args['query']}".`,
        };
      },
    },
  ];
}
