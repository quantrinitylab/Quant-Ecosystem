import type { ToolDefinition } from '../types.js';

export const tubeTools: ToolDefinition[] = [
  {
    id: 'quantube.upload',
    appId: 'quantube',
    name: 'Upload Video',
    description: 'Upload a video to Quantube',
    inputSchema: {
      title: { type: 'string', required: true, description: 'Video title' },
      description: {
        type: 'string',
        required: false,
        description: 'Video description',
        default: '',
      },
      tags: { type: 'array', required: false, description: 'Video tags', default: [] },
    },
    outputSchema: {
      type: 'object',
      description: 'Upload result',
      fields: {
        videoId: { type: 'string', description: 'Uploaded video ID' },
        processingStatus: { type: 'string', description: 'Processing status' },
      },
    },
    permissionTier: 1,
    costEstimate: 'medium',
    undoRecipe: null,
    tags: ['video', 'upload', 'content'],
  },
  {
    id: 'quantube.publish',
    appId: 'quantube',
    name: 'Publish Video',
    description: 'Make a video public and available for viewing',
    inputSchema: {
      videoId: { type: 'string', required: true, description: 'Video ID to publish' },
      visibility: {
        type: 'string',
        required: false,
        description: 'Visibility (public, unlisted, private)',
        default: 'public',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Publish result',
      fields: {
        success: { type: 'boolean', description: 'Whether publish succeeded' },
        url: { type: 'string', description: 'Public video URL' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['video', 'publish', 'release'],
  },
  {
    id: 'quantube.schedule',
    appId: 'quantube',
    name: 'Schedule Video',
    description: 'Schedule a video for future publication',
    inputSchema: {
      videoId: { type: 'string', required: true, description: 'Video ID to schedule' },
      publishAt: { type: 'string', required: true, description: 'Publish time in ISO 8601' },
    },
    outputSchema: {
      type: 'object',
      description: 'Schedule result',
      fields: {
        success: { type: 'boolean', description: 'Whether scheduling succeeded' },
        scheduledFor: { type: 'string', description: 'Scheduled publish time' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['video', 'schedule', 'plan'],
  },
  {
    id: 'quantube.analytics',
    appId: 'quantube',
    name: 'Video Analytics',
    description: 'Get analytics for a video or channel',
    inputSchema: {
      videoId: { type: 'string', required: false, description: 'Video ID (omit for channel-wide)' },
      period: {
        type: 'string',
        required: false,
        description: 'Time period (day, week, month)',
        default: 'week',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Analytics data',
      fields: {
        views: { type: 'number', description: 'Total views' },
        likes: { type: 'number', description: 'Total likes' },
        watchTime: { type: 'number', description: 'Watch time in minutes' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['video', 'analytics', 'metrics'],
  },
  {
    id: 'quantube.moderate',
    appId: 'quantube',
    name: 'Moderate Comments',
    description: 'Moderate comments on a video (approve, remove, flag)',
    inputSchema: {
      videoId: { type: 'string', required: true, description: 'Video ID' },
      commentId: { type: 'string', required: true, description: 'Comment ID to moderate' },
      action: { type: 'string', required: true, description: 'Action: approve, remove, flag' },
    },
    outputSchema: {
      type: 'object',
      description: 'Moderation result',
      fields: {
        success: { type: 'boolean', description: 'Whether action succeeded' },
        status: { type: 'string', description: 'Comment new status' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['video', 'moderate', 'comments'],
  },
];
