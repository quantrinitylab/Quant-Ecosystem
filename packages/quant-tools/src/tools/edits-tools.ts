import type { ToolDefinition } from '../types.js';

export const editsTools: ToolDefinition[] = [
  {
    id: 'quantedits.create-project',
    appId: 'quantedits',
    name: 'Create Video Project',
    description: 'Create a new video editing project',
    inputSchema: {
      name: { type: 'string', required: true, description: 'Project name' },
      resolution: {
        type: 'string',
        required: false,
        description: 'Output resolution (1080p, 4k)',
        default: '1080p',
      },
      fps: { type: 'number', required: false, description: 'Frames per second', default: 30 },
    },
    outputSchema: {
      type: 'object',
      description: 'Project creation result',
      fields: {
        projectId: { type: 'string', description: 'Project ID' },
        timeline: { type: 'string', description: 'Timeline ID' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['video', 'edit', 'project'],
  },
  {
    id: 'quantedits.render',
    appId: 'quantedits',
    name: 'Render Project',
    description: 'Render a video project to final output',
    inputSchema: {
      projectId: { type: 'string', required: true, description: 'Project ID to render' },
      format: {
        type: 'string',
        required: false,
        description: 'Output format (mp4, webm, mov)',
        default: 'mp4',
      },
      quality: {
        type: 'string',
        required: false,
        description: 'Quality preset (draft, standard, high)',
        default: 'standard',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Render result',
      fields: {
        renderId: { type: 'string', description: 'Render job ID' },
        estimatedTime: { type: 'number', description: 'Estimated time in seconds' },
      },
    },
    permissionTier: 1,
    costEstimate: 'high',
    undoRecipe: null,
    tags: ['video', 'render', 'export'],
  },
  {
    id: 'quantedits.add-track',
    appId: 'quantedits',
    name: 'Add Track',
    description: 'Add a video, audio, or subtitle track to a project',
    inputSchema: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      trackType: {
        type: 'string',
        required: true,
        description: 'Track type (video, audio, subtitle)',
      },
      sourceId: { type: 'string', required: true, description: 'Source media ID' },
    },
    outputSchema: {
      type: 'object',
      description: 'Track addition result',
      fields: {
        trackId: { type: 'string', description: 'New track ID' },
        position: { type: 'number', description: 'Track position index' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['video', 'track', 'timeline'],
  },
  {
    id: 'quantedits.export',
    appId: 'quantedits',
    name: 'Export Clip',
    description: 'Export a section of the timeline as a clip',
    inputSchema: {
      projectId: { type: 'string', required: true, description: 'Project ID' },
      startMs: { type: 'number', required: true, description: 'Start time in milliseconds' },
      endMs: { type: 'number', required: true, description: 'End time in milliseconds' },
      format: { type: 'string', required: false, description: 'Export format', default: 'mp4' },
    },
    outputSchema: {
      type: 'object',
      description: 'Export result',
      fields: {
        clipId: { type: 'string', description: 'Exported clip ID' },
        url: { type: 'string', description: 'Download URL' },
      },
    },
    permissionTier: 1,
    costEstimate: 'medium',
    undoRecipe: null,
    tags: ['video', 'export', 'clip'],
  },
  {
    id: 'quantedits.apply-effect',
    appId: 'quantedits',
    name: 'Apply Effect',
    description: 'Apply a visual or audio effect to a track',
    inputSchema: {
      trackId: { type: 'string', required: true, description: 'Track ID to apply effect to' },
      effectType: {
        type: 'string',
        required: true,
        description: 'Effect type (blur, fade, filter, speed)',
      },
      params: { type: 'object', required: false, description: 'Effect-specific parameters' },
    },
    outputSchema: {
      type: 'object',
      description: 'Effect application result',
      fields: {
        success: { type: 'boolean', description: 'Whether effect was applied' },
        effectId: { type: 'string', description: 'Applied effect ID' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['video', 'effect', 'filter'],
  },
];
