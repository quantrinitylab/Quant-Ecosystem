import type { ToolDefinition } from '../types.js';

export const neonTools: ToolDefinition[] = [
  {
    id: 'quantneon.post',
    appId: 'quantneon',
    name: 'Create Post',
    description: 'Create a social media post on QuantNeon',
    inputSchema: {
      content: { type: 'string', required: true, description: 'Post content text' },
      media: { type: 'array', required: false, description: 'Media attachment URLs', default: [] },
      visibility: {
        type: 'string',
        required: false,
        description: 'Post visibility (public, followers, private)',
        default: 'public',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Post creation result',
      fields: {
        postId: { type: 'string', description: 'Created post ID' },
        url: { type: 'string', description: 'Post URL' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['social', 'post', 'create'],
  },
  {
    id: 'quantneon.like',
    appId: 'quantneon',
    name: 'Like Post',
    description: 'Like a post on QuantNeon',
    inputSchema: {
      postId: { type: 'string', required: true, description: 'Post ID to like' },
    },
    outputSchema: {
      type: 'object',
      description: 'Like result',
      fields: {
        success: { type: 'boolean', description: 'Whether like was recorded' },
        likeCount: { type: 'number', description: 'New total like count' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['social', 'like', 'engage'],
  },
  {
    id: 'quantneon.comment',
    appId: 'quantneon',
    name: 'Comment on Post',
    description: 'Add a comment to a QuantNeon post',
    inputSchema: {
      postId: { type: 'string', required: true, description: 'Post ID to comment on' },
      content: { type: 'string', required: true, description: 'Comment text' },
    },
    outputSchema: {
      type: 'object',
      description: 'Comment result',
      fields: {
        commentId: { type: 'string', description: 'Created comment ID' },
        timestamp: { type: 'number', description: 'Comment timestamp' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['social', 'comment', 'reply'],
  },
  {
    id: 'quantneon.repost',
    appId: 'quantneon',
    name: 'Repost',
    description: 'Repost content on QuantNeon to your followers',
    inputSchema: {
      postId: { type: 'string', required: true, description: 'Post ID to repost' },
      comment: { type: 'string', required: false, description: 'Optional repost comment' },
    },
    outputSchema: {
      type: 'object',
      description: 'Repost result',
      fields: {
        repostId: { type: 'string', description: 'Repost ID' },
        success: { type: 'boolean', description: 'Whether repost succeeded' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['social', 'repost', 'share'],
  },
  {
    id: 'quantneon.search',
    appId: 'quantneon',
    name: 'Search Posts',
    description: 'Search posts on QuantNeon by keywords or hashtags',
    inputSchema: {
      query: { type: 'string', required: true, description: 'Search query or hashtag' },
      limit: { type: 'number', required: false, description: 'Max results', default: 20 },
    },
    outputSchema: {
      type: 'array',
      description: 'Matching posts',
      fields: {
        postId: { type: 'string', description: 'Post ID' },
        content: { type: 'string', description: 'Post content' },
        author: { type: 'string', description: 'Author username' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['social', 'search', 'discover'],
  },
];
