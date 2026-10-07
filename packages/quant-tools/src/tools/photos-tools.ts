import type { ToolDefinition } from '../types.js';

export const photosTools: ToolDefinition[] = [
  {
    id: 'quantphotos.upload',
    appId: 'quantphotos',
    name: 'Upload Photo',
    description: 'Upload a photo to QuantPhotos library',
    inputSchema: {
      fileName: { type: 'string', required: true, description: 'Photo file name' },
      album: { type: 'string', required: false, description: 'Album to add to' },
      tags: { type: 'array', required: false, description: 'Photo tags', default: [] },
    },
    outputSchema: {
      type: 'object',
      description: 'Upload result',
      fields: {
        photoId: { type: 'string', description: 'Uploaded photo ID' },
        url: { type: 'string', description: 'Photo URL' },
      },
    },
    permissionTier: 0,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['photos', 'upload', 'media'],
  },
  {
    id: 'quantphotos.organize',
    appId: 'quantphotos',
    name: 'Organize Photos',
    description: 'Organize photos into albums or apply tags',
    inputSchema: {
      photoIds: { type: 'array', required: true, description: 'Photo IDs to organize' },
      album: { type: 'string', required: false, description: 'Album to move to' },
      addTags: { type: 'array', required: false, description: 'Tags to add', default: [] },
    },
    outputSchema: {
      type: 'object',
      description: 'Organization result',
      fields: {
        organized: { type: 'number', description: 'Number of photos organized' },
        success: { type: 'boolean', description: 'Whether operation succeeded' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['photos', 'organize', 'album'],
  },
  {
    id: 'quantphotos.edit',
    appId: 'quantphotos',
    name: 'Edit Photo',
    description: 'Apply edits to a photo (crop, filter, adjust)',
    inputSchema: {
      photoId: { type: 'string', required: true, description: 'Photo ID to edit' },
      edits: { type: 'object', required: true, description: 'Edit operations to apply' },
    },
    outputSchema: {
      type: 'object',
      description: 'Edit result',
      fields: {
        success: { type: 'boolean', description: 'Whether edit was applied' },
        newVersion: { type: 'number', description: 'New version number' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['photos', 'edit', 'adjust'],
  },
  {
    id: 'quantphotos.share',
    appId: 'quantphotos',
    name: 'Share Photos',
    description: 'Share photos or albums with other users',
    inputSchema: {
      photoIds: { type: 'array', required: true, description: 'Photo IDs to share' },
      recipients: { type: 'array', required: true, description: 'User IDs to share with' },
      allowDownload: {
        type: 'boolean',
        required: false,
        description: 'Allow recipients to download',
        default: true,
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Share result',
      fields: {
        shareLink: { type: 'string', description: 'Share link' },
        sharedWith: { type: 'number', description: 'Number of recipients' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['photos', 'share', 'collaborate'],
  },
  {
    id: 'quantphotos.search',
    appId: 'quantphotos',
    name: 'Search Photos',
    description: 'Search photos by tags, date, location, or AI-detected content',
    inputSchema: {
      query: { type: 'string', required: true, description: 'Search query' },
      dateRange: { type: 'object', required: false, description: 'Date range filter' },
      limit: { type: 'number', required: false, description: 'Max results', default: 50 },
    },
    outputSchema: {
      type: 'array',
      description: 'Matching photos',
      fields: {
        photoId: { type: 'string', description: 'Photo ID' },
        url: { type: 'string', description: 'Thumbnail URL' },
        takenAt: { type: 'string', description: 'Date taken' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['photos', 'search', 'find'],
  },
];
