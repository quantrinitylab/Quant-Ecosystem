import type { ToolDefinition } from '../types.js';

export const syncTools: ToolDefinition[] = [
  {
    id: 'quantsync.sync-contacts',
    appId: 'quantsync',
    name: 'Sync Contacts',
    description: 'Synchronize contacts across all Quant apps',
    inputSchema: {
      source: { type: 'string', required: true, description: 'Source app to sync from' },
      direction: {
        type: 'string',
        required: false,
        description: 'Sync direction (push, pull, bidirectional)',
        default: 'bidirectional',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Sync result',
      fields: {
        synced: { type: 'number', description: 'Number of contacts synced' },
        conflicts: { type: 'number', description: 'Number of conflicts detected' },
      },
    },
    permissionTier: 1,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['sync', 'contacts', 'cross-app'],
  },
  {
    id: 'quantsync.sync-files',
    appId: 'quantsync',
    name: 'Sync Files',
    description: 'Synchronize files between local device and QuantDrive',
    inputSchema: {
      path: { type: 'string', required: true, description: 'Local path or folder to sync' },
      remotePath: {
        type: 'string',
        required: false,
        description: 'Remote destination path',
        default: '/',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'File sync result',
      fields: {
        uploaded: { type: 'number', description: 'Files uploaded' },
        downloaded: { type: 'number', description: 'Files downloaded' },
        conflicts: { type: 'number', description: 'Conflicts found' },
      },
    },
    permissionTier: 1,
    costEstimate: 'low',
    undoRecipe: null,
    tags: ['sync', 'files', 'storage'],
  },
  {
    id: 'quantsync.sync-settings',
    appId: 'quantsync',
    name: 'Sync Settings',
    description: 'Synchronize user preferences and settings across devices',
    inputSchema: {
      scope: {
        type: 'string',
        required: false,
        description: 'Settings scope (all, theme, notifications)',
        default: 'all',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Settings sync result',
      fields: {
        success: { type: 'boolean', description: 'Whether sync succeeded' },
        settingsCount: { type: 'number', description: 'Number of settings synced' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['sync', 'settings', 'preferences'],
  },
  {
    id: 'quantsync.check-status',
    appId: 'quantsync',
    name: 'Check Sync Status',
    description: 'Check the current synchronization status of all services',
    inputSchema: {
      service: { type: 'string', required: false, description: 'Specific service to check' },
    },
    outputSchema: {
      type: 'object',
      description: 'Sync status',
      fields: {
        status: { type: 'string', description: 'Overall sync status' },
        lastSync: { type: 'number', description: 'Last sync timestamp' },
        pendingChanges: { type: 'number', description: 'Pending changes count' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['sync', 'status', 'health'],
  },
  {
    id: 'quantsync.resolve-conflict',
    appId: 'quantsync',
    name: 'Resolve Conflict',
    description: 'Resolve a sync conflict by choosing a resolution strategy',
    inputSchema: {
      conflictId: { type: 'string', required: true, description: 'Conflict ID to resolve' },
      strategy: {
        type: 'string',
        required: true,
        description: 'Resolution strategy (local, remote, merge)',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Resolution result',
      fields: {
        success: { type: 'boolean', description: 'Whether conflict was resolved' },
        resolvedItem: { type: 'string', description: 'Resolved item identifier' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['sync', 'conflict', 'resolve'],
  },
];
