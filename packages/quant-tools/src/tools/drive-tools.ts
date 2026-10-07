import type { ToolDefinition } from '../types.js';

export const driveTools: ToolDefinition[] = [
  {
    id: 'quantdrive.upload',
    appId: 'quantdrive',
    name: 'Upload File',
    description: 'Upload a file to QuantDrive storage',
    inputSchema: {
      fileName: { type: 'string', required: true, description: 'File name' },
      folderId: {
        type: 'string',
        required: false,
        description: 'Destination folder ID',
        default: 'root',
      },
      mimeType: { type: 'string', required: true, description: 'File MIME type' },
      size: { type: 'number', required: true, description: 'File size in bytes' },
    },
    outputSchema: {
      type: 'object',
      description: 'Upload result',
      fields: {
        fileId: { type: 'string', description: 'Uploaded file ID' },
        url: { type: 'string', description: 'File access URL' },
      },
    },
    permissionTier: 1,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['drive', 'upload', 'storage'],
  },
  {
    id: 'quantdrive.download',
    appId: 'quantdrive',
    name: 'Download File',
    description: 'Download a file from QuantDrive',
    inputSchema: {
      fileId: { type: 'string', required: true, description: 'File ID to download' },
      format: { type: 'string', required: false, description: 'Export format if converting' },
    },
    outputSchema: {
      type: 'object',
      description: 'Download result',
      fields: {
        url: { type: 'string', description: 'Temporary download URL' },
        expiresAt: { type: 'number', description: 'URL expiration timestamp' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['drive', 'download', 'file'],
  },
  {
    id: 'quantdrive.share',
    appId: 'quantdrive',
    name: 'Share File',
    description: 'Share a file or folder with another user',
    inputSchema: {
      fileId: { type: 'string', required: true, description: 'File or folder ID to share' },
      email: { type: 'string', required: true, description: 'Email to share with' },
      role: {
        type: 'string',
        required: false,
        description: 'Permission role (viewer, editor)',
        default: 'viewer',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Share result',
      fields: {
        success: { type: 'boolean', description: 'Whether sharing succeeded' },
        shareLink: { type: 'string', description: 'Generated share link' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['drive', 'share', 'collaborate'],
  },
  {
    id: 'quantdrive.organize',
    appId: 'quantdrive',
    name: 'Organize Files',
    description: 'Move files between folders or create folder structure',
    inputSchema: {
      fileIds: { type: 'array', required: true, description: 'File IDs to move' },
      destinationId: { type: 'string', required: true, description: 'Destination folder ID' },
    },
    outputSchema: {
      type: 'object',
      description: 'Organization result',
      fields: {
        moved: { type: 'number', description: 'Number of files moved' },
        failed: { type: 'number', description: 'Number of failures' },
      },
    },
    permissionTier: 1,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['drive', 'organize', 'move'],
  },
  {
    id: 'quantdrive.search',
    appId: 'quantdrive',
    name: 'Search Files',
    description: 'Search for files by name, type, or content',
    inputSchema: {
      query: { type: 'string', required: true, description: 'Search query' },
      type: { type: 'string', required: false, description: 'File type filter' },
      limit: { type: 'number', required: false, description: 'Max results', default: 20 },
    },
    outputSchema: {
      type: 'array',
      description: 'Matching files',
      fields: {
        fileId: { type: 'string', description: 'File ID' },
        name: { type: 'string', description: 'File name' },
        mimeType: { type: 'string', description: 'MIME type' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['drive', 'search', 'find'],
  },
];
