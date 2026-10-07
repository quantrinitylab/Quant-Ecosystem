import type { ToolDefinition } from '../types.js';

export const chatTools: ToolDefinition[] = [
  {
    id: 'quantchat.send',
    appId: 'quantchat',
    name: 'Send Message',
    description: 'Send a chat message to a channel or direct message',
    inputSchema: {
      channelId: { type: 'string', required: true, description: 'Channel or DM ID' },
      message: { type: 'string', required: true, description: 'Message content' },
      replyTo: { type: 'string', required: false, description: 'Message ID to reply to' },
    },
    outputSchema: {
      type: 'object',
      description: 'Send result',
      fields: {
        messageId: { type: 'string', description: 'Sent message ID' },
        timestamp: { type: 'number', description: 'Send timestamp' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['chat', 'message', 'send'],
  },
  {
    id: 'quantchat.create-channel',
    appId: 'quantchat',
    name: 'Create Channel',
    description: 'Create a new chat channel with specified members',
    inputSchema: {
      name: { type: 'string', required: true, description: 'Channel name' },
      members: { type: 'array', required: true, description: 'Initial member user IDs' },
      isPrivate: {
        type: 'boolean',
        required: false,
        description: 'Whether channel is private',
        default: false,
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Channel creation result',
      fields: {
        channelId: { type: 'string', description: 'New channel ID' },
        name: { type: 'string', description: 'Channel name' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['chat', 'channel', 'create'],
  },
  {
    id: 'quantchat.react',
    appId: 'quantchat',
    name: 'React to Message',
    description: 'Add an emoji reaction to a chat message',
    inputSchema: {
      messageId: { type: 'string', required: true, description: 'Message ID to react to' },
      emoji: { type: 'string', required: true, description: 'Emoji reaction' },
    },
    outputSchema: {
      type: 'object',
      description: 'Reaction result',
      fields: {
        success: { type: 'boolean', description: 'Whether reaction was added' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['chat', 'reaction', 'emoji'],
  },
  {
    id: 'quantchat.pin',
    appId: 'quantchat',
    name: 'Pin Message',
    description: 'Pin a message in a chat channel',
    inputSchema: {
      messageId: { type: 'string', required: true, description: 'Message ID to pin' },
      channelId: { type: 'string', required: true, description: 'Channel ID' },
    },
    outputSchema: {
      type: 'object',
      description: 'Pin result',
      fields: {
        success: { type: 'boolean', description: 'Whether pin was successful' },
        pinnedAt: { type: 'number', description: 'Pin timestamp' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['chat', 'pin', 'organize'],
  },
  {
    id: 'quantchat.search',
    appId: 'quantchat',
    name: 'Search Messages',
    description: 'Search chat messages across channels',
    inputSchema: {
      query: { type: 'string', required: true, description: 'Search query' },
      channelId: { type: 'string', required: false, description: 'Limit search to channel' },
      limit: { type: 'number', required: false, description: 'Max results', default: 20 },
    },
    outputSchema: {
      type: 'array',
      description: 'Matching messages',
      fields: {
        messageId: { type: 'string', description: 'Message ID' },
        content: { type: 'string', description: 'Message content' },
        sender: { type: 'string', description: 'Sender user ID' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['chat', 'search', 'query'],
  },
];
