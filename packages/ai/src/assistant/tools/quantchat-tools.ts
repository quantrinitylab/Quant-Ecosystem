// ============================================================================
// QuantChat - AI Tool Definitions
// ============================================================================

import type { AITool, AIToolResult, AssistantContext } from '../types';

export function getQuantchatTools(): AITool[] {
  return [
    {
      name: 'sendMessage',
      description: 'Send a message to a contact or group chat',
      parameters: {
        recipient: { type: 'string', description: 'The recipient username or ID', required: true },
        content: { type: 'string', description: 'The message content to send', required: true },
      },
      handler: async (
        args: Record<string, unknown>,
        _context: AssistantContext,
      ): Promise<AIToolResult> => {
        globalThis.console.log('[quantchat] sendMessage:', args);
        return {
          success: true,
          data: { messageId: `msg_${Date.now()}`, recipient: args['recipient'], sent: true },
          displayMessage: `Message sent to ${args['recipient']}: "${args['content']}"`,
        };
      },
    },
    {
      name: 'createGroupChat',
      description: 'Create a new group chat with specified members',
      parameters: {
        name: { type: 'string', description: 'Group chat name', required: true },
        members: {
          type: 'string',
          description: 'Comma-separated list of member usernames',
          required: true,
        },
      },
      handler: async (
        args: Record<string, unknown>,
        _context: AssistantContext,
      ): Promise<AIToolResult> => {
        globalThis.console.log('[quantchat] createGroupChat:', args);
        return {
          success: true,
          data: { groupId: `group_${Date.now()}`, name: args['name'] },
          displayMessage: `Group chat "${args['name']}" created successfully.`,
        };
      },
    },
    {
      name: 'searchContacts',
      description: 'Search for contacts by name or username',
      parameters: {
        query: { type: 'string', description: 'Search query for contacts', required: true },
      },
      handler: async (
        args: Record<string, unknown>,
        _context: AssistantContext,
      ): Promise<AIToolResult> => {
        globalThis.console.log('[quantchat] searchContacts:', args);
        return {
          success: true,
          data: { results: [{ username: 'john_doe', displayName: 'John Doe' }] },
          displayMessage: `Found contacts matching "${args['query']}".`,
        };
      },
    },
  ];
}
